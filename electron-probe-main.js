const e = require('electron')
console.log('type', typeof e)
console.log('keysSample', typeof e === 'object' ? Object.keys(e).slice(0,15) : String(e).slice(0,120))
console.log('protocol', typeof e?.protocol)
if (e?.app) {
  e.app.whenReady().then(() => { console.log('READY'); e.app.quit() })
} else {
  process.exit(2)
}
