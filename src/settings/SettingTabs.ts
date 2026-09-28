import { ButtonComponent, PluginSettingTab, Setting } from 'obsidian';
import { compressionMode, IFrogEncrypter } from '../utils/types';
import { FilePackEncrypt } from '../core/FilePackEncrypt';
import { SettingsService } from './SettingsService';
import { PasswordManager } from '../utils/PasswordManager';
import { StorageService } from '../utils/StorageService';
import { getTimeStamp } from '../utils/mics';
import { CompressionExtensionModal } from '../modals/CompressionExtensionModal';

export class FrogPluginSettingTab extends PluginSettingTab {
	private plugin: IFrogEncrypter;

	constructor(plugin: IFrogEncrypter) {
		super(plugin.app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ==================== GENERAL SETTINGS ====================

		new Setting(containerEl)
			.setHeading()
			.setName('🔒 General encryption settings');

		new Setting(containerEl)
			.setName('Confirm password')
			.setDesc('Re-enter your new password to verify it matches and ensure there are no accidental typos.')
			.addToggle((toggle) => {
				toggle.setValue(SettingsService.getConfirmPassword());
				toggle.onChange(async (value) => {
					await SettingsService.setConfirmPassword(value);
				});
			});

		new Setting(containerEl)
			.setName('Remember password')
			.setDesc('Saves your password to bypass entry for a set period or until the app is closed.')
			.addToggle((toggle) => {
				toggle.setValue(SettingsService.getRememberPasswords());
				toggle.onChange(async (value) => {
					updateShowPasswordLifetime(value);
					await SettingsService.setRememberPasswordsInMemory(value);
					if (!value)
						PasswordManager.clearPasswords();
				});
			});

		const autofillLastPassword = new Setting(containerEl)
			.setName('Autofill recent password')
			.setDesc('Automatically autofill the most recently used successful password when creating a new encrypted block.')
			.addToggle((toggle) => {
				toggle.setValue(SettingsService.getAutofillLastPassword());
				toggle.onChange(async (value) => {
					await SettingsService.setAutofillLastPassword(value);
				});
			});

		const passwordLifetime = new Setting(containerEl)
			.setName('Password lifetime')
			.setDesc('The time in minutes that the password will be available after it is entered (minimum 1 min).')
			.addText((text) => {
				text.setValue(SettingsService.getPasswordTtlMinutes().toString());
				text.onChange(async (value) => {
					const numericValue = parseInt(value) || 1;
					await SettingsService.setPasswordTtlMinutes(numericValue > 525600 ? 525600 : numericValue);
					PasswordManager.rearrangeExpireTime();
				});
				text.inputEl.type = 'number';
			});

		const updateShowPasswordLifetime = (rememberPassword: boolean) => {
			if (rememberPassword) {
				passwordLifetime.settingEl.show();
				autofillLastPassword.settingEl.show();
			} else {
				passwordLifetime.settingEl.hide();
				autofillLastPassword.settingEl.hide();
			}
		};

		updateShowPasswordLifetime(SettingsService.getRememberPasswords());

		// ==================== FILE PACK ===============================================================================
		new Setting(containerEl)
			.setHeading()
			.setName('📦 Pack Encryption .fpack');

		// ======================================= VAULT PACK ==========================================================
		const buttonsVault: {output: ButtonComponent | null; encrypt: ButtonComponent | null;} = {output: null, encrypt: null };
		const vaultVars: {selectVaultPath: string | null; outputPath: string | null;} = {selectVaultPath: null,	outputPath: null};

		new Setting(containerEl)
			.setName('Encrypted Vault Backup')
			.setDesc('Select a vault to create a password-protected, encrypted backup copy')
			.addDropdown((dropdown) => {
				dropdown.addOptions(StorageService.getVaultOptions(this.plugin));
				vaultVars.selectVaultPath = dropdown.getValue();
				dropdown.onChange(() => {
					vaultVars.selectVaultPath = dropdown.getValue();
					if (buttonsVault.output?.buttonEl.disabled)
						buttonsVault.output?.setCta().setDisabled(false);
				});
			})
			.addButton((button) => {
				buttonsVault.output = button
					.setButtonText('Output file')
					.setDisabled(true)
					.onClick(async () => {
						const title = 'Select a folder and name your encrypted file';
						const defaultName = `Packed ${getTimeStamp()}`;
						vaultVars.outputPath = await StorageService.openSaveDialog(title, defaultName);

						if (!vaultVars.outputPath) 
							return;

						button.setTooltip(`${vaultVars.outputPath}`);
						button.removeCta();
						buttonsVault.encrypt?.setDisabled(false).setCta();
						buttonsVault.encrypt?.setTooltip(`Vault to encrypt: ${vaultVars.selectVaultPath ?? ''}`);
					});

				if (vaultVars.selectVaultPath)
					button.setCta().setDisabled(false);
			})
			.addButton((button) => {
				buttonsVault.encrypt = button
					.setButtonText('Encrypt')
					.setDisabled(true)
					.onClick(async () => {
						const isSuccess = 
						await FilePackEncrypt.packAndEncryptItems(
							this.plugin, 
							vaultVars.selectVaultPath ?? '', 
							vaultVars.outputPath ?? ''
						);
						if (!isSuccess) 
							return;
						
						button.setDisabled(true).removeCta();
						buttonsVault.output?.setCta();
					});
			});

		// ================================= ENCRYPT PACK ================================================
		const buttonsEncryptPack: {
			select: ButtonComponent | null;
			output: ButtonComponent | null;
			encrypt: ButtonComponent | null;
		} = { select: null, output: null, encrypt: null };
		
		const encryptPackVars: {
			selectedPaths: string[] | null;
			outputPath: string | null;
			isFolderMode: boolean;
		} = { selectedPaths: null, outputPath: null, isFolderMode: false };
		
		const encryptPack = new Setting(containerEl)
			.setName('Encrypt external files')
			.setDesc('Select files from your device to secure with encryption')
			.addExtraButton((extraButton) => {
				extraButton.setTooltip('Change encryption mode');
				extraButton.onClick(() => {
					if (encryptPackVars.isFolderMode) {
						encryptPackVars.isFolderMode = false;
						encryptPack.setName('Encrypt external files');
						encryptPack.setDesc('Select files from your device to secure with encryption');
						buttonsEncryptPack.select?.setButtonText('Select files');
					} else {
						encryptPackVars.isFolderMode = true;
						encryptPack.setName('Encrypt external folders');
						encryptPack.setDesc('Select and encrypt folders, including all nested files');
						buttonsEncryptPack.select?.setButtonText('Select folders');
					}
				});
			})
			.addButton((button) => {
				buttonsEncryptPack.select = button
					.setButtonText('Select files')
					.setCta()
					.onClick(async () => {
						const title = `Select ${encryptPackVars.isFolderMode ? 'folders' : 'files'} to encrypt`;
						const properties = [encryptPackVars.isFolderMode ? 'openDirectory' : 'openFile', 'multiSelections'];

						encryptPackVars.selectedPaths = await StorageService.openDialog(title, properties);
						if (!encryptPackVars.selectedPaths) 
							return;

						button.setTooltip(encryptPackVars.selectedPaths.join('\n'));
						button.removeCta();

						if (buttonsEncryptPack.output?.buttonEl.disabled)
							buttonsEncryptPack.output?.setDisabled(false).setCta();
					});
			})
			.addButton((button) => {
				buttonsEncryptPack.output = button
					.setButtonText('Output file')
					.setDisabled(true)
					.onClick(async () => {
						const title = 'Select a folder and name your encrypted file';
						const defaultName = `Packed ${getTimeStamp()}`;

						encryptPackVars.outputPath = await StorageService.openSaveDialog(title, defaultName);
						if (!encryptPackVars.outputPath) 
							return;

						button.setTooltip(`${encryptPackVars.outputPath}`);
						button.removeCta();
						buttonsEncryptPack.encrypt?.setDisabled(false).setCta();
					});
			})
			.addButton((button) => {
				buttonsEncryptPack.encrypt = button
					.setButtonText('Encrypt')
					.setDisabled(true)
					.onClick(async () => {
						const isSuccess =await FilePackEncrypt.packAndEncryptItems(
								this.plugin,
								encryptPackVars.selectedPaths ?? '',
								encryptPackVars.outputPath ?? '',
							);

						if (!isSuccess) 
							return;

						button.setDisabled(true).removeCta();
						buttonsEncryptPack.output?.setDisabled(true);
						buttonsEncryptPack.select?.setCta();
					});
			});

		// =============================== DECRYPT PACK ==========================================================
		const buttonsDecryptPack: {
			select: ButtonComponent | null;
			output: ButtonComponent | null;
			decrypt: ButtonComponent | null;
		} = { select: null, output: null, decrypt: null };
		const decryptPackVars: {
			selectedPath: string | null;
			outputPath: string | null;
		} = { selectedPath: null, outputPath: null };

		new Setting(containerEl)
			.setName('Decrypt .fpack file')
			.setDesc('Select and decrypt encrypted .fpack files')
			.addButton((button) => {
				buttonsDecryptPack.select = button
					.setButtonText('Select .fpack')
					.setCta()
					.onClick(async () => {
						const title = `Select a .fpack file to decrypt`;
						const properties = ['openFile'];
						const extensions = [{ name: 'Frog Pack', extensions: ['fpack'] }];
						const selectedPath = await StorageService.openDialog(title, properties, extensions);

						if (!selectedPath) 
							return;

						decryptPackVars.selectedPath = selectedPath[0] ?? null;
						if (!decryptPackVars.selectedPath) 
							return;

						button.setTooltip(decryptPackVars.selectedPath);
						button.removeCta();
						
						if (buttonsDecryptPack.output?.buttonEl.disabled)
							buttonsDecryptPack.output?.setDisabled(false).setCta();
					});
			})
			.addButton((button) => {
				buttonsDecryptPack.output = button
					.setButtonText('Output folder')
					.setDisabled(true)
					.onClick(async () => {
						const title = 'Select a folder to decrypt';
						const properties = ['openDirectory'];

						const outputPath = await StorageService.openDialog(title, properties);
						if (!outputPath) 
							return;

						decryptPackVars.outputPath = outputPath[0] ?? null;
						if (!decryptPackVars.outputPath) 
							return;

						button.setTooltip(`${decryptPackVars.outputPath}`);
						button.removeCta();
						buttonsDecryptPack.decrypt?.setDisabled(false).setCta();
					});
			})
			.addButton((button) => {
				buttonsDecryptPack.decrypt = button
					.setButtonText('Decrypt')
					.setDisabled(true)
					.onClick(async () => {
						const isSuccess =
							await FilePackEncrypt.decryptAndUnpack(this.plugin, decryptPackVars.selectedPath ?? '', decryptPackVars.outputPath ?? '');
						if (!isSuccess) 
							return;

						button.setDisabled(true).removeCta();
						buttonsDecryptPack.output?.setDisabled(true);
						buttonsDecryptPack.select?.setCta();
					});
			});

		// =================== COMPRESSION SETTINGS =======================================================================
		new Setting(containerEl)
			.setHeading()
			.setName('🗜 Compression settings');

		let compressionButton: ButtonComponent;
		new Setting(containerEl)
			.setName('Compression mode')
			.setDesc('Choose how to compress files before encryption')
			.addDropdown((dropdown) => {
				const modes: Record<compressionMode, string> = {
					always: 'Always compress',
					never: 'Never compress',
					by_extension: 'Compress by extension',
				};
				dropdown.addOptions(modes);
				dropdown.setValue(SettingsService.getCompressionMode());
				dropdown.onChange(async (value) => {
					await SettingsService.setCompressionMode(value as compressionMode);

					if (value === 'by_extension') {
						compressionButton.setCta();
						compressionButton.buttonEl.disabled = false;
					} else {
						compressionButton.removeCta();
						compressionButton.buttonEl.disabled = true;
					}
				});
			})
			.addButton((button) => {
				compressionButton = button
					.setButtonText('Configure extensions')
					.setCta()
					.onClick(async () => {
						new CompressionExtensionModal(this.app).open();
					});

					if (SettingsService.getCompressionMode() !== 'by_extension') {
						button.buttonEl.disabled = true;
						button.removeCta();
					}
			});
	}
}
