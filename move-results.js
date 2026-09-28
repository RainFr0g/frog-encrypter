const fs = require('fs');
const path = require('path');

const startTime = process.hrtime();

// 📁 Path to your frog-encrypter folder in the vault — files from result/ will be copied here.
//    Example: D:/Obsidian/Vault/.obsidian/plugins/frog-encrypter
const targetDir = resolvePath(`YOUR PATH TO OBSIDIAN PLUGIN!!!`);

const sourceDir = resolvePath(path.join(process.cwd(), 'result'));
validateTargetDir(targetDir);

const shouldClean = process.argv.includes('-r');

if (shouldClean) {
    console.log('Cleaning target directory...');
    if (fs.existsSync(targetDir)) 
        fs.readdirSync(targetDir).forEach(file => {
            fs.rmSync(path.join(targetDir, file), { recursive: true, force: true });
        });
}

if (!fs.existsSync(targetDir)) {
    console.log(`Creating target directory: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
}

console.log(`Checking source files in: ${sourceDir}`);
if (fs.existsSync(sourceDir)) {
    console.log('Copying files...');
    fs.readdirSync(sourceDir).forEach(file => {
        const srcFile = path.join(sourceDir, file);
        const destFile = path.join(targetDir, file);
        
        const stat = fs.statSync(srcFile);
        if (stat.isFile()) {
            const fileExists = fs.existsSync(destFile);
            const fileBuffer = fs.readFileSync(srcFile);

            if (fileExists) {
                const oldFileBuffer = fs.readFileSync(destFile);
                
                const isChanged = Buffer.compare(fileBuffer, oldFileBuffer) !== 0;

                if (isChanged) {
                    fs.writeFileSync(destFile, fileBuffer, { flag: 'w' });
                    console.log(`-> File [${file}] was UPDATED (changes detected)`);
                } else {
                    console.log(`-> File [${file}] is IDENTICAL (skipped, no write)`);
                }
            } else {
                fs.writeFileSync(destFile, fileBuffer, { flag: 'w' });
                console.log(`-> Created new file: [${file}]`);
            }
        } else if (stat.isDirectory()) {
            fs.cpSync(srcFile, destFile, { recursive: true, force: true, errorOnExist: false });
            console.log(`-> Copied folder: [${file}]`);
        }
    });
    console.log('All files successfully processed!');
} else {
    console.log(`Error: Source folder "result" not found at path: ${sourceDir}`);
}

const endTime = process.hrtime(startTime);
const durationInMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);

console.log(`Execution time: ${durationInMs} ms`);

function validateTargetDir(dir) {
    if (!dir || dir.trim() === '') {
        console.error('\n❌ Target path is empty. Please set it in move-results.js.');
        process.exit(1);
    }
    if (!path.isAbsolute(dir)) {
        console.error('\n❌ Target path in move-results.js is not absolute:', dir);
        console.error('   Example: D:/Obsidian/Vault/.obsidian/plugins/frog-encrypter');
        process.exit(1);
    }
    const parentDir = path.dirname(dir);
    if (!fs.existsSync(parentDir)) {
        console.error('\n❌ Parent directory does not exist:');
        console.error('   ' + parentDir);
        console.error('   Check that your vault path is correct.');
        process.exit(1);
    }
}

function resolvePath(rawPath) {
    let cleanPath = rawPath.replace(/\\/g, '/');
    
    const isWsl = process.platform === 'linux' && fs.existsSync('/proc/version') && 
                  fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

    if (isWsl) {
        const driveMatch = cleanPath.match(/^([A-Za-z]):/);
        if (driveMatch) {
            const driveLetter = driveMatch[1].toLowerCase();
            cleanPath = cleanPath.replace(/^[A-Za-z]:/, `/mnt/${driveLetter}`);
        }
        return Buffer.from(cleanPath, 'utf-8').toString();
    }

    return path.normalize(cleanPath);
}