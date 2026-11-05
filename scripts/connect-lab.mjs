import {spawn} from 'node:child_process';

const args=process.argv.slice(2);
if(args.length===1&&['--help','-h'].includes(args[0])){
  console.log('Usage: npm run lab:connect -- <SSH-host-or-user@host>\n\nForwards http://127.0.0.1:8765 to the shared Citepeek server.\nUses your own SSH credentials. Does not install or start a model.\nKeep this terminal open; press Ctrl+C to disconnect.');
  process.exit(0);
}
const target=args[0];
if(args.length!==1||!target||target.startsWith('-')||!/^[\w.@:\[\]-]+$/.test(target)){
  console.error('Usage: npm run lab:connect -- <SSH-host-or-user@host>\nConfigure a custom SSH port or key in your SSH config.');
  process.exit(1);
}
console.log('SSHで共有Citepeekに接続します。接続後は http://127.0.0.1:8765/ を開いてください。\nこの端末を開いたまま利用してください。終了は Ctrl+C。\n8765番ポートが使用中なら、既存のCitepeekまたは転送を確認してください。');
const child=spawn('ssh',[
  '-N','-o','ExitOnForwardFailure=yes',
  '-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3',
  '-L','127.0.0.1:8765:127.0.0.1:8765','--',target,
],{stdio:'inherit'});
child.on('error',error=>{console.error(`SSHを起動できません: ${error.message}`);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?0:1);});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
