import { Jimp } from 'jimp';
import fs from 'fs';

async function main() {
  try {
    let sourcePath = 'public/favicon.png';
    const priorities = [
      'public/logo.png',
      'logo.png',
      'public/favicon.png'
    ];

    for (const p of priorities) {
      if (fs.existsSync(p)) {
        sourcePath = p;
        break;
      }
    }

    if (!fs.existsSync(sourcePath)) {
      console.log('Source image not found');
      return;
    }

    const image = await Jimp.read(sourcePath);
    console.log(`Using source: ${sourcePath} (${image.bitmap.width}x${image.bitmap.height})`);
    
    // Opaque square logo (Resize to 512x512 for high quality app icon)
    const targetSize = 512;
    const resizedLogo = image.clone().scaleToFit({ w: targetSize, h: targetSize });
    const bgOpaque = new Jimp({ width: targetSize, height: targetSize, color: 0xFFFFFFFF });
    
    // Center the resized logo on the opaque background
    bgOpaque.composite(
      resizedLogo, 
      (targetSize - resizedLogo.bitmap.width) / 2, 
      (targetSize - resizedLogo.bitmap.height) / 2
    );
    
    const logoBuffer = await bgOpaque.getBuffer('image/png');
    fs.writeFileSync('logo-opaque.png', logoBuffer);

    // Header: 150x57 (NSIS installer header)
    const headerBg = new Jimp({ width: 150, height: 57, color: 0xFFFFFFFF });
    const headerLogo = image.clone().scaleToFit({ w: 57, h: 57 });
    headerBg.composite(headerLogo, 150 - 57, (57 - headerLogo.bitmap.height) / 2);
    const headerBuffer = await headerBg.getBuffer('image/bmp');
    fs.writeFileSync('installerHeader.bmp', headerBuffer);

    // Sidebar: 164x314 (NSIS installer sidebar)
    const sidebarBg = new Jimp({ width: 164, height: 314, color: 0xFFFFFFFF });
    const sidebarLogo = image.clone().scaleToFit({ w: 130, h: 130 });
    sidebarBg.composite(sidebarLogo, (164 - sidebarLogo.bitmap.width) / 2, 40);
    const sidebarBuffer = await sidebarBg.getBuffer('image/bmp');
    fs.writeFileSync('installerSidebar.bmp', sidebarBuffer);

    console.log('Successfully generated correctly sized opaque images for installer.');
  } catch (err) {
    console.error(err);
  }
}

main();
