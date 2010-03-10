var sys = require("sys");

var inArray = function (array, value) {
// Returns true if the passed value is found in the
// array. Returns false if it is not.
  var i;
  for (i=0; i < array.length; i++) {
    // Matches identical (===), not just similar (==).
    if (array[i] === value) {
      return true;
    }
  }
  return false;
};

var OptionParser = function (args) {
  if (!args) {
    var args = process.ARGV;
  } 
  this.args = args;
  this.singleCharMap = {};
  this.longCharMap = {};
  this.allOptions = [];
}
OptionParser.prototype.addOption = function (singleChar, longChar, type, name, defaultValue, comment, callback) {
  if (singleChar) {
    this.singleCharMap[singleChar] = [type, name, defaultValue, comment, callback];
  }
  if (longChar) {
    this.longCharMap[longChar] = [type, name, defaultValue, comment, callback];
  }
  this.allOptions.push([singleChar, longChar, type, name, defaultValue, comment]);
}
OptionParser.prototype.printHelp = function () {
  for (i in this.allOptions) {
    var singleChar = this.allOptions[i][0];
    var longChar = this.allOptions[i][1];
    var comment = this.allOptions[i][5];
    sys.puts(singleChar+",  "+longChar+" :: "+comment);
  }
}
OptionParser.prototype._rparse = function (help, i, args) {  
  var a = args[i];
  if (i == 0 && a.match('node'+"$")=='node') {
    this.program = a;
    this.script = args[i + 1];
    i++; i++;
  } else if (i == 0 && a.match('.js'+"$")=='.js') {
    this.script = a;
    i++;
  } else if (help && a == 'help') {
    this.printHelp();
    process.exit();
  } else {
    if (this.singleCharMap[a] != undefined) {
      var handler = this.singleCharMap[a];
      if (handler[0] != 'bool') {
        var value = args[i + 1];
        i++; i++;
      } else {
        var value = (!handler[2]);
        i++;
      }
    } else if (a.indexOf('=') != -1) {
      var handler = this.longCharMap[a.split('=')[0]];
      var value = a.split('=')[1];
      i++;
    } else if (this.longCharMap[a] != undefined) {
      var handler = this.longCharMap[a];
      if (handler[0] != 'bool') {
        var value = args[i + 1];
        i++; i++;
      } else {
        var value = (!handler[2])
        i++;
      }
    } else {
      sys.puts("Invalid Option: "+a);
      process.exit(1);
    }

    if (handler[0] == "number") {
      this.options[handler[1]] = parseInt(value);
    } else {
      this.options[handler[1]] = value;
    }
    
    if (handler[4]) {
      handler[4](value);
    }
  }
  if (i != (args.length)) {
    this._rparse(help, i, args)
  }
}

OptionParser.prototype.parse = function (help) {
  if (help == undefined) {
    var help = true;
  }
  this.options = {};
  this._rparse(help, 0, this.args);
  for (i in this.singleCharMap) {
    var name = this.singleCharMap[i][1];
    if (this.options[name] == undefined) {
      this.options[name] = this.singleCharMap[i][2];
    }
  }
  for (i in this.longCharMap) {
    var name = this.longCharMap[i][1];
    if (this.options[name] == undefined) {
      this.options[name] = this.longCharMap[i][2];
    }
  }
  return this.options;
}
OptionParser.prototype.ifScript = function (filename, callback, help) {
  var op = this;
  process.ARGV.forEach(function(a) {if (a == filename){ callback(op.parse(help))}});
}

exports.OptionParser = OptionParser;