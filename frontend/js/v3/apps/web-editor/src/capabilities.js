function assertFunction(owner,name){if(typeof owner?.[name]!=='function')throw new Error(`Web Editor requires capability method: ${name}`);}
function assertId(owner,name){if(!String(owner?.[name]||'').trim())throw new Error(`Web Editor requires filesystem.${name}`);}

export function resolveWebEditorCapabilities({capabilities={}}={}){
  const {filesystem,dialog,notifications,sound}=capabilities;
  for(const name of ['allNodes','childrenOf','createFile','createFolder','getNode','readFileBlob','updateFileContent'])assertFunction(filesystem,name);
  assertId(filesystem,'documentsId');
  for(const name of ['prompt','confirm'])assertFunction(dialog,name);
  assertFunction(notifications,'notify');
  assertFunction(sound,'play');
  return Object.freeze({filesystem,dialog,notifications,sound});
}
