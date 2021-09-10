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

  const cells = [{
        
        
      },];

  

  const namespaces = cells.map(cells => Object.create(null, cells));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

          functors[0]({
          imports(entries) {
            const map = new Map(entries);
            
          },
          liveVar: {
            
          },
          onceVar: {
            
          },
        });
      

})([
  (({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,  }) => {   $h‍_imports([]);   // import { Buffer } from 'buffer/index.js'
// import WalletExports from 'ethereumjs-wallet'

// const { default: Wallet } = WalletExports
// console.log(Wallet)

// const fixturePrivateKey = 'efca4cdd31923b50f4214af5d2ae10e7ac45a5019e9431cc195482d707485378'
// const fixturePrivateKeyBuffer = Buffer.from(fixturePrivateKey, 'hex')
// const fixtureWallet = Wallet.fromPrivateKey(fixturePrivateKeyBuffer)

// console.log(`address: ${fixtureWallet.getAddress().toString('hex')}`)

console.log('hello');
})

,

]);
