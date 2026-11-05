import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/tests',{recursive:true});
const output='.sites-runtime/tests/papers.test.mjs';
await build({entryPoints:['tests/papers.test.ts'],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22'});
const result=spawnSync(process.execPath,['--test',output],{stdio:'inherit'});
process.exitCode=result.status??1;
