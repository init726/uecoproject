import {spawn} from 'node:child_process';
const child=spawn('ollama',['serve'],{stdio:'inherit',env:{...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'}});
child.on('error',()=>{console.error('Ollama를 설치한 뒤 다시 실행해 주세요.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
