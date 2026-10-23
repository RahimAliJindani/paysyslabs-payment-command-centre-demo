import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const QRCode=require('./vendor/QRCode');
const ECL=require('./vendor/QRCode/QRErrorCorrectLevel');
export function qrSvg(value){const qr=new QRCode(-1,ECL.M);qr.addData(value);qr.make();const n=qr.getModuleCount(), pad=4, size=n+2*pad;let cells='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))cells+=`<rect x="${x+pad}" y="${y+pad}" width="1" height="1"/>`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><g fill="#102a50">${cells}</g></svg>`}
