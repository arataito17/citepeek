import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';

const output='.sites-runtime/tests';
await mkdir(output,{recursive:true});
const files=(await readdir('tests')).filter(file=>file.endsWith('.test.ts')).sort();
if(!files.length)throw Error('No unit tests found');
const compiled=[];
for(const file of files){
  const outfile=path.join(output,file.replace(/\.ts$/,'.mjs'));
  await build({entryPoints:[path.join('tests',file)],outfile,bundle:true,platform:'node',format:'esm',target:'node22'});
  compiled.push(outfile);
}
const result=spawnSync(process.execPath,['--test',...compiled],{stdio:'inherit'});
process.exitCode=result.status??1;
