import fs from 'fs'
import '../endo/packages/ses/index.js'
// import { makeBundle } from '../endo/packages/compartment-mapper/index.js'

import { resolve } from '../endo/packages/compartment-mapper/src/node-module-specifier.js';
import { compartmentMapForNodeModules } from '../endo/packages/compartment-mapper/src/node-modules.js';
import { search } from '../endo/packages/compartment-mapper/src/search.js';
import { link } from '../endo/packages/compartment-mapper/src/link.js';
import { makeImportHookMaker } from '../endo/packages/compartment-mapper/src/import-hook.js';
import { parseJson } from '../endo/packages/compartment-mapper/src/parse-json.js';
import { parseArchiveCjs } from '../endo/packages/compartment-mapper/src/parse-archive-cjs.js';
import { parseArchiveMjs } from '../endo/packages/compartment-mapper/src/parse-archive-mjs.js';
import { parseLocatedJson } from '../endo/packages/compartment-mapper/src/json.js';

const textEncoder = new TextEncoder();

/** quotes strings */
const q = JSON.stringify;

/** @type {Record<string, ParseFn>} */
const parserForLanguage = {
  mjs: parseArchiveMjs,
  cjs: parseArchiveCjs,
  json: parseJson,
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @param {Record<string, CompartmentSources>} compartmentSources
 * @param {Record<string, ResolveHook>} compartmentResolvers
 * @param {string} entryCompartmentName
 * @param {string} entryModuleSpecifier
 */
 const sortedModules = (
  compartmentDescriptors,
  compartmentSources,
  compartmentResolvers,
  entryCompartmentName,
  entryModuleSpecifier,
) => {
  const modules = [];
  const seen = new Set();

  /**
   * @param {string} compartmentName
   * @param {string} moduleSpecifier
   */
  const recur = (compartmentName, moduleSpecifier) => {
    const key = `${compartmentName}#${moduleSpecifier}`;
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);

    const resolve = compartmentResolvers[compartmentName];
    const source = compartmentSources[compartmentName][moduleSpecifier];
    if (source) {
      const { record, parser } = source;
      if (record) {
        const {
          imports = [],
          reexports = [],
        } = /** @type {PrecompiledStaticModuleInterface} */ (record);
        const resolvedImports = {};
        for (const importSpecifier of [...imports, ...reexports]) {
          const resolvedSpecifier = resolve(importSpecifier, moduleSpecifier);
          resolvedImports[importSpecifier] = recur(
            compartmentName,
            resolvedSpecifier,
          );
        }

        modules.push({
          key,
          compartmentName,
          moduleSpecifier,
          parser,
          record,
          resolvedImports,
        });

        return key;
      }
    } else {
      const descriptor =
        compartmentDescriptors[compartmentName].modules[moduleSpecifier];
      if (descriptor) {
        const {
          compartment: aliasCompartmentName,
          module: aliasModuleSpecifier,
        } = descriptor;
        if (
          aliasCompartmentName !== undefined &&
          aliasModuleSpecifier !== undefined
        ) {
          return recur(aliasCompartmentName, aliasModuleSpecifier);
        }
      }
    }

    throw new Error(
      `Cannot bundle: cannot follow module import ${moduleSpecifier} in compartment ${compartmentName}`,
    );
  };

  recur(entryCompartmentName, entryModuleSpecifier);

  return modules;
};


// lockdown()

const read = async location => fs.promises.readFile(new URL(location).pathname)
const entryPath = new URL('browser.js', import.meta.url).toString()

const bundle = await makeBundle(read, entryPath, {
  // tags: new Set(['browser'])
})
// await fs.promises.writeFile('./dist.js', bundle)
console.log('done')


async function makeBundle (read, moduleLocation, options) {
  const {
    moduleTransforms,
    /** @type {Set<string>} */
    tags = new Set(),
  } = options || {};
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
  );
  
  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {Sources} */
  const sources = {};

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment, resolvers } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
  });
  await compartment.load(entryModuleSpecifier);

  const modules = sortedModules(
    compartmentMap.compartments,
    sources,
    resolvers,
    entryCompartmentName,
    entryModuleSpecifier,
  );

  // Create an index of modules so we can resolve import specifiers to the
  // index of the corresponding functor.
  const modulesByKey = {};
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    module.index = index;
    modulesByKey[module.key] = module;
  }
  for (const module of modules) {
    module.indexedImports = Object.fromEntries(
      Object.entries(module.resolvedImports).map(([importSpecifier, key]) => [
        importSpecifier,
        modulesByKey[key].index,
      ]),
    );
  }

  // Only support mjs format.
  const problems = modules
    .filter(module => module.parser !== 'pre-mjs-json')
    .map(
      ({ moduleSpecifier, compartmentName, parser }) =>
        `module ${moduleSpecifier} in compartment ${compartmentName} in language ${parser}`,
    );
  if (problems.length) {
    throw new Error(
      `Can only bundle applications that only have ESM (.mjs-type) modules, got ${problems.join(
        ', ',
      )}`,
    );
  }

  const bundle = `\
'use strict';
(functors => {
  function cell(name, value = undefined) {
    const observers = [];
    function set(newValue) {
      value = newValue;
      for (const observe of observers) {
        observe(value);
      }
    }
    function get() {
      return value;
    }
    function observe(observe) {
      observers.push(observe);
      observe(value);
    }
    return { get, set, observe, enumerable: true };
  }
  const cells = [${''.concat(
    ...modules.map(
      ({ record: { __fixedExportMap__, __liveExportMap__ } }) => `{
        ${''.concat(
          ...Object.keys(__fixedExportMap__).map(
            exportName => `${exportName}: cell(${q(exportName)}),\n`,
          ),
        )}
        ${''.concat(
          ...Object.keys(__liveExportMap__).map(
            exportName => `${exportName}: cell(${q(exportName)}),\n`,
          ),
        )}
      },`,
    ),
  )}];
  ${''.concat(
    ...modules.flatMap(({ index, indexedImports, record: { reexports } }) =>
      reexports.map(
        (/* @type {string} */ importSpecifier) => `\
          Object.defineProperties(cells[${index}], Object.getOwnPropertyDescriptors(cells[${indexedImports[importSpecifier]}]));
        `,
      ),
    ),
  )}
  const namespaces = cells.map(cells => Object.create(null, cells));
  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }
  ${''.concat(
    ...modules.map(
      ({
        index,
        indexedImports,
        record: { __liveExportMap__, __fixedExportMap__ },
      }) => `\
        functors[${index}]({
          imports(entries) {
            const map = new Map(entries);
            ${''.concat(
              ...Object.entries(indexedImports).map(
                ([importName, importIndex]) => `\
                  for (const [name, observers] of map.get(${q(importName)})) {
                    const cell = cells[${importIndex}][name];
                    if (cell === undefined) {
                      throw new ReferenceError(\`Cannot import name \${name}\`);
                    }
                    for (const observer of observers) {
                      cell.observe(observer);
                    }
                  }
                `,
              ),
            )}
          },
          liveVar: {
            ${''.concat(
              ...Object.entries(__liveExportMap__).map(
                ([exportName, [importName]]) => `\
                  ${importName}: cells[${index}].${exportName}.set,
                `,
              ),
            )}
          },
          onceVar: {
            ${''.concat(
              ...Object.entries(__fixedExportMap__).map(
                ([exportName, [importName]]) => `\
                  ${importName}: cells[${index}].${exportName}.set,
                `,
              ),
            )}
          },
        });
      `,
    ),
  )}
})([
  ${''.concat(
    ...modules.map(
      ({ record: { __syncModuleProgram__ } }) =>
        `${__syncModuleProgram__}\n,\n`,
    ),
  )}
]);
`;

  return bundle;
}

