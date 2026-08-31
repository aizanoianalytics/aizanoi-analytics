function assertFunction(owner,name){if(typeof owner?.[name]!=='function')throw new Error(`Workspace requires capability method: ${name}`);}
function assertId(owner,name){if(!String(owner?.[name]||'').trim())throw new Error(`Workspace requires capability id: ${name}`);}
export function resolveWorkspaceCapabilities({capabilities={}}={}){
  const filesystem=capabilities.filesystem;
  for(const name of ['allNodes','childrenOf','createFile','createFolder','formatSize','getNode','readFileBlob','renameNode','trashNode'])assertFunction(filesystem,name);
  for(const name of ['documentsId','picturesId','musicId'])assertId(filesystem,name);
  assertFunction(capabilities.apps,'open');assertFunction(capabilities.dialog,'prompt');assertFunction(capabilities.notifications,'notify');assertFunction(capabilities.sound,'play');
  return Object.freeze({apps:capabilities.apps,dialog:capabilities.dialog,filesystem,notifications:capabilities.notifications,sound:capabilities.sound});
}
