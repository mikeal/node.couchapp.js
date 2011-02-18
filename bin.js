#!/usr/bin/env node
var couchapp = require('./main.js')
  , watch = require('watch')
  , path = require('path')
  , fs = require('fs')
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
  console.log(
    [ "couchapp -- utility for creating couchapps" 
    , ""
    , "Usage:"
    , "  couchapp <command> app.js http://localhost:5984/dbname"
    , ""
    , "Commands:"
    , "  push   : Push app once to server."
    , "  sync   : Push app then watch local files for changes."
    , "  boiler : Create a boiler project."
    ]
    .join('\n')
  )
  process.exit();
}

function copytree (source, dest) {
  watch.walk(source, function (err, files) {
    for (i in files) {
      (function (i) {
        if (files[i].isDirectory()) {
          try {
            fs.mkdirSync(i.replace(source, dest), 0755)
          } catch(e) {
            console.log('Could not create '+dest)
          }
        } else {
          fs.readFile(i, function (err, data) {
            if (err) throw err;
            fs.writeFile(i.replace(source, dest), data, function (err) {
              if (err) throw err;
            });
          })
        } 
      })(i); 
    }
  })
}

if (command == 'boiler') {
  if (app) {
    try { fs.mkdirSync(path.join(process.env.PWD, app)) }
    catch(e) {};
  }
  app = app || '.'
  
  copytree(path.join(__dirname, 'boiler'), path.join(process.env.PWD, app));
} else {
  couchapp.createApp(require(abspath(app)), couch, function (app) {
    if (command == 'push') app.push()
    else if (command == 'sync') app.sync()
  
  })
}


