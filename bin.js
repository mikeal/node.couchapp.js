var couchapp = require('./main.js')
  , path = require('path')
  ;

function abspath (pathname) {
  return path.join(process.env.PWD, path.normalize(pathname));
}

var node = process.argv.shift()
  , bin = process.argv.shift()
  , command = process.argv.shift()
  , app = process.argv.shift()
  , couch = process.argv.shift()
  ;

if (command == 'help' || command == undefined) {
  console.log([
      "couchapp -- utility for creating couchapps" 
    , ""
    , "Usage:"
    , "  couchapp <command> app.js http://localhost:5984/dbname"
    , ""
    , "Commands:"
    , "  push : Push app once to server."
    , "  sync : Push app then watch local files for changes."
  ].join('\n'))
  process.exit();
}

couchapp.createApp(require(abspath(app)), couch, function (app) {
  if (command == 'push') app.push()
  else if (command == 'sync') app.sync()
  
})
