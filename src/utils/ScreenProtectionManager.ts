import { IFrogEncrypter } from './types';
import { MD_ENCRYPTED_EXTENSION, FILE_ENCRYPTED_EXTENSION, MD_VIEW_TYPE, FILE_VIEW_TYPE } from './constants';
import { SettingsService } from '../settings/SettingsService';

export class ScreenProtectionManager {
    private static remote: ElectronRemoteModule | null = null;
    private static plugin: IFrogEncrypter | null = null;
    private static supported = false;
    private static initialized = false;
    private static protectionActive = false;

    static init(plugin: IFrogEncrypter): void {
        if (this.initialized) 
            return;
        
        this.initialized = true;
        this.plugin = plugin;

        const platform = typeof process !== 'undefined' && process.platform ? process.platform : '';

        if (platform !== 'win32' && platform !== 'darwin') 
            return;

        try {
            this.remote = window.require('@electron/remote');
            this.supported = !!this.remote?.BrowserWindow;
        } catch (e) {
            console.error('Frog Encrypter: @electron/remote unavailable', e);
            this.supported = false;
        }

        plugin.registerEvent(
            plugin.app.workspace.on('window-open', () => {
                if (this.protectionActive)
                    this.applyProtection(true);
            })
        );
        plugin.registerEvent(
            plugin.app.workspace.on('layout-change', () => {
                this.releaseIfNoOtherOpen();
            })
        );

        this.onModeChanged();
    }

    static enable(): void {
        const protectionMode = SettingsService.getScreenProtectionMode();
        if (!this.supported || protectionMode === 'never' || this.protectionActive ) 
            return;

        this.protectionActive = true;
        this.applyProtection(true);
    }

    static releaseIfNoOtherOpen(): void {
        const protectionMode = SettingsService.getScreenProtectionMode();
        if (!this.supported || protectionMode === 'always' || !this.protectionActive || this.hasAnyOpenEncryptedView() ) 
            return;

        this.protectionActive = false;
        this.applyProtection(false);
    }

    static onModeChanged(): void {
        const mode = SettingsService.getScreenProtectionMode();
        if (mode === 'always') 
            this.enable();
        else if (mode === 'never') 
            this.forceDisable();
        else if (mode === 'when_encrypted_open')
            if (this.hasAnyOpenEncryptedView()) 
                this.enable();
            else 
                this.forceDisable();
    }

    private static forceDisable(): void {
        if (!this.supported || !this.protectionActive) 
            return;
        this.protectionActive = false;
        this.applyProtection(false);
    }
    
    private static applyProtection(enabled: boolean): void {
        if (!this.supported || !this.remote) 
            return;

        try {
            for (const w of this.remote.BrowserWindow.getAllWindows()) 
                if (typeof w.setContentProtection === 'function')
                    w.setContentProtection(enabled);
        } catch (e) {
            console.error('Frog Encrypter: setContentProtection failed', e);
        }
    }

    private static hasAnyOpenEncryptedView(): boolean {
        if (!this.plugin) 
            return false;

        let found = false;

        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
            if (found) 
                return;

            if (leaf.isDeferred) 
                try {
                    const state = leaf.getViewState();
                    const inner = state.state as { file?: unknown } | undefined;
                    const filePath = inner?.file;
                    if (typeof filePath === 'string') {
                        const ext = filePath.split('.').pop()?.toLowerCase();
                        if (ext === MD_ENCRYPTED_EXTENSION || ext === FILE_ENCRYPTED_EXTENSION)
                            found = true;
                    }
                } catch { /* ignore */ }
            else {
                const viewType = leaf.view?.getViewType();
                if (viewType === MD_VIEW_TYPE || viewType === FILE_VIEW_TYPE)
                    found = true;
            }
        });

        return found;
    }


    static unInit(): void {
        if (this.protectionActive) {
            this.applyProtection(false);
            this.protectionActive = false;
        }

        this.remote = null;
        this.supported = false;
        this.initialized = false;
        this.plugin = null;
    }
}

interface ElectronBrowserWindow {
    setContentProtection?(enable: boolean): void;
}

interface ElectronRemoteModule {
    BrowserWindow: {
        getAllWindows(): ElectronBrowserWindow[];
    };
}