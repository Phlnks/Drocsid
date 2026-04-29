import { Jimp } from 'jimp';
import fs from 'fs';

async function main() {
  try {
    let sourcePath = 'public/favicon.png';
    if (fs.existsSync('logo.png')) {
      sourcePath = 'logo.png';
    } else if (fs.existsSync('public/logo.png')) {
      sourcePath = 'public/logo.png';
    }

    if (!fs.existsSync(sourcePath)) {
      console.log('Source image not found');
      return;
    }

    const image = await Jimp.read(sourcePath);
    
    // Opaque square logo
    const bgOpaque = new Jimp({ width: image.bitmap.width, height: image.bitmap.height, color: 0xFFFFFFFF });
    bgOpaque.composite(image, 0, 0);
    await bgOpaque.write('logo-opaque.png');

    // Header: 150x57 (let's resize logo to fit inside 57x57)
    const headerBg = new Jimp({ width: 150, height: 57, color: 0xFFFFFFFF });
    const headerLogo = image.clone().scaleToFit({ w: 57, h: 57 });
    // Center it on the right side of the header
    headerBg.composite(headerLogo, 150 - 57, 0);
    await headerBg.write('installerHeader.bmp');

    // Sidebar: 164x314 (let's resize logo to fit inside 130x130, and center it at the top)
    const sidebarBg = new Jimp({ width: 164, height: 314, color: 0xFFFFFFFF });
    const sidebarLogo = image.clone().scaleToFit({ w: 130, h: 130 });
    sidebarBg.composite(sidebarLogo, (164 - sidebarLogo.bitmap.width) / 2, 20);
    await sidebarBg.write('installerSidebar.bmp');

    console.log('Successfully generated correctly sized opaque images for installer.');
  } catch (err) {
    console.error(err);
  }
}

main();
