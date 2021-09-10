import fs from 'fs'
import crypto from 'crypto'
import { builtinModules } from 'module'
import '../endo/packages/ses/index.js'
// import { resolve } from '../endo/packages/compartment-mapper/src/node-module-specifier.js';
import { makeNodeReadPowers } from '../endo/packages/compartment-mapper/src/node-powers.js';
import {
  loadLocation,
  // importLocation,
  // makeArchive,
  // writeArchive,
  // parseArchive,
  // loadArchive,
  // importArchive,
  // hashLocation,
} from '../endo/packages/compartment-mapper/index.js';


const readPowers = makeNodeReadPowers(fs, crypto);
const entryPath = new URL('node.js', import.meta.url).toString()

// const bufferExitNamespaceBox = { namespace: {} }
// const bufferExitModule = { import: async () => { return bufferExitNamespaceBox } }
const modules = await prepareBuiltinModules(builtinModules)
console.log('done builtin')

const application = await loadLocation(readPowers, entryPath, {});
console.log('done load app')
const { namespace } = await application.import({
  // globals,
  // globalLexicals,
  modules,
  // Compartment,
});
console.log('done exec app')

async function prepareBuiltinModules (moduleList) {
  return Object.fromEntries(await asyncMap(moduleList, async modulePath => {
    // object entries format
    return [modulePath, await makeExitModule(modulePath)]
  }))
}

function asyncMap (list, mapFn) {
  return Promise.all(list.map(async entry => {
    return mapFn(entry)
  }))
}

async function makeExitModule (name) {
  const fakeRead = async path => {
    // console.log('fakeRead', path)
    const ext = path.split('.').slice(-1)[0]
    if (ext === 'json') {
      return Buffer.from('{}')
    } else {
      return Buffer.from('module.exports = 1+1')
    }
  };
  const entryPath = new URL(`builtin/${name}.js`, import.meta.url).toString()
  const utility = await loadLocation(fakeRead, entryPath, {});
  const { namespace } = await utility.import({})
  return namespace
}