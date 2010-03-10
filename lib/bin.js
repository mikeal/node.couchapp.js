var optionparser = require('./dep/optionparser'),
    couchapp = require('./couchapp'),
    test = require('./test'),
    sync = require('./sync'),
    path = require('path'),
    sys = require('sys');

var opts = new optionparser.OptionParser();
opts.addOption('-d', '--design', 'string', 'design', null, "File or directory for design document(s)");
opts.addOption('-t', '--test', 'bool', 'test', false, "Run tests.");
opts.addOption('-s', '--sync', 'bool', 'sync', false, "Sync with CouchDB.");
opts.addOption('-c', '--couch', 'string', 'couch', null, "Url to couchdb.");

var options = opts.parse(true);

function abspath (pathname) {
  return path.join(process.env.PWD, path.normalize(pathname));
}

if (options.design) { 
  var design = abspath(options.design);
  var module = require(design.slice(0, design.length - (path.extname(design).length)))
  var ddocs = [];
  for (name in module) {
    ddocs.push([name, module[name]]);
  }
  if (options.test) {
    ddocs.forEach(function (d) {test.testDesignDoc(d[0], d[1])})
  }
  if (options.sync) {
    if (!options.couch) {sys.puts("You forgot to give me a couchurl"); process.exit()}
    ddocs.forEach(function (d) {
      couchapp.sync(d[1], options.couch);
      sys.puts('Syncing '+d[0]+' finished.')
    })
  }
}