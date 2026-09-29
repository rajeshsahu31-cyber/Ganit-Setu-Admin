// Ganit Setu: same-origin FFmpeg class worker for @ffmpeg/ffmpeg 0.12.10.
// This is a self-contained ESM worker. It intentionally does NOT import 814.ffmpeg.js.
const CORE_VERSION = "0.12.6";
const CORE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
const FFMessageType = {
  LOAD:"LOAD", EXEC:"EXEC", FFPROBE:"FFPROBE", WRITE_FILE:"WRITE_FILE", READ_FILE:"READ_FILE",
  DELETE_FILE:"DELETE_FILE", RENAME:"RENAME", CREATE_DIR:"CREATE_DIR", LIST_DIR:"LIST_DIR",
  DELETE_DIR:"DELETE_DIR", ERROR:"ERROR", DOWNLOAD:"DOWNLOAD", PROGRESS:"PROGRESS", LOG:"LOG",
  MOUNT:"MOUNT", UNMOUNT:"UNMOUNT"
};
const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");
let ffmpeg;

async function load(cfg={}) {
  let coreURL = cfg.coreURL || CORE_URL;
  const wasmURL = cfg.wasmURL || coreURL.replace(/\.js$/g,".wasm");
  const workerURL = cfg.workerURL || coreURL.replace(/\.js$/g,".worker.js");
  try {
    // coreURL is normally a blob URL produced by toBlobURL().
    importScripts(coreURL);
  } catch (e) {
    self.createFFmpegCore = (await import(coreURL)).default;
    if (!self.createFFmpegCore) throw ERROR_IMPORT_FAILURE;
  }
  if (!self.createFFmpegCore) throw ERROR_IMPORT_FAILURE;
  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({wasmURL,workerURL}))}`
  });
  ffmpeg.setLogger(data=>self.postMessage({type:FFMessageType.LOG,data}));
  ffmpeg.setProgress(data=>self.postMessage({type:FFMessageType.PROGRESS,data}));
  return true;
}
function exec({args,timeout=-1}) { ffmpeg.setTimeout(timeout); ffmpeg.exec(...args); const ret=ffmpeg.ret; ffmpeg.reset(); return ret; }
function ffprobe({args,timeout=-1}) { ffmpeg.setTimeout(timeout); ffmpeg.ffprobe(...args); const ret=ffmpeg.ret; ffmpeg.reset(); return ret; }
function writeFile({path,data}) { ffmpeg.FS.writeFile(path,data); return true; }
function readFile({path,encoding}) { return ffmpeg.FS.readFile(path,{encoding}); }
function deleteFile({path}) { ffmpeg.FS.unlink(path); return true; }
function rename({oldPath,newPath}) { ffmpeg.FS.rename(oldPath,newPath); return true; }
function createDir({path}) { ffmpeg.FS.mkdir(path); return true; }
function listDir({path}) { const nodes=[]; for(const name of ffmpeg.FS.readdir(path)){const stat=ffmpeg.FS.stat(`${path}/${name}`);nodes.push({name,isDir:ffmpeg.FS.isDir(stat.mode)});} return nodes; }
function deleteDir({path}) { ffmpeg.FS.rmdir(path); return true; }
function mount({fsType,options,mountPoint}) { const fs=ffmpeg.FS.filesystems[fsType]; if(!fs)return false; ffmpeg.FS.mount(fs,options,mountPoint); return true; }
function unmount({mountPoint}) { ffmpeg.FS.unmount(mountPoint); return true; }

self.onmessage = async ({data:{id,type,data:_data}}) => {
  const trans=[]; let data;
  try {
    if(type!==FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;
    switch(type){
      case FFMessageType.LOAD: data=await load(_data); break;
      case FFMessageType.EXEC: data=exec(_data); break;
      case FFMessageType.FFPROBE: data=ffprobe(_data); break;
      case FFMessageType.WRITE_FILE: data=writeFile(_data); break;
      case FFMessageType.READ_FILE: data=readFile(_data); break;
      case FFMessageType.DELETE_FILE: data=deleteFile(_data); break;
      case FFMessageType.RENAME: data=rename(_data); break;
      case FFMessageType.CREATE_DIR: data=createDir(_data); break;
      case FFMessageType.LIST_DIR: data=listDir(_data); break;
      case FFMessageType.DELETE_DIR: data=deleteDir(_data); break;
      case FFMessageType.MOUNT: data=mount(_data); break;
      case FFMessageType.UNMOUNT: data=unmount(_data); break;
      default: throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch(e) {
    self.postMessage({id,type:FFMessageType.ERROR,data:String(e&&e.stack||e)}); return;
  }
  if(data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({id,type,data},trans);
};
