/*
 * Mingler - An easy to use source concatenation tool
 * Inspired by both Sprockets and Juicer
 */
var path  = require('path'),
    fs    = require('fs'),
    exists = 'exists' in fs ? fs.exists : path.exists,
    existsSync = 'existsSync' in fs ? fs.existsSync : path.existsSync;

// Util functions
function notify(event) {
  var args = Array.prototype.slice.call(arguments).slice(1);
  mingler._listeners[event].forEach(function(listener) {
    listener.apply(null, args);
  });
}

function FeedbackObject(filename) {
  var isDiscarded = false;
  var isChanged = false;
  var content;

  this.filename = filename;

  this.content = function(val) {
    return content = (typeof val === 'string') ? val : content;
  };

  this.discard = function() {
    isDiscarded = true;
  };

  this.discarded = function() {
    return isDiscarded;
  };
}

var Concatenater = {
  concatenate: function(filename, branch, parent) {
    var feed = new FeedbackObject(filename);
    notify('concatenate', feed);

    if(feed.discarded()) {
      return '';
    }

    if(!existsSync(filename) && !feed.content()) {
      notify('error', filename + ' doesn\'t exist!');
      return false;
    }

    var match, file, files = {}, content;

    content = feed.content() || fs.readFileSync(filename, 'utf8');

    // First run
    if(typeof branch == 'undefined') {
      this.branch = branch = {};
      this.original = content;
    }

    // Check for infinite loop
    if(this.inBranch(filename, parent, this.branch)) {
      notify('error', 'Infinite loop detected in ' + filename);
      return null;
    }

    branch[filename] = {};

    // Add main file, to "already concatenated files" list
    var includeRegex = this.includeRegex;
    includeRegex.lastIndex = 0;

    // Find each //=include <file> instance
    while((match = includeRegex.exec(content)) != null) {
      file = match[2];
      var line = this.getLineNumber(match.index, this.original);
      // If <file> is included from <file> then error
      if(file == filename) {
        notify('error', 'Recursive concatenation in ' + file 
                + ' at line: ' + line);
        return null;
      }

      // Recursive concatenation
      var newfile = this.concatenate(file, branch[filename], filename);
      if(typeof newfile != 'string') {
        return;
      }

      var indent = match[1].length;
      var conc = content.substr(0, match.index);

      var lines = newfile.split('\n'), i, length;
      for (i = 0, length = lines.length; i < length; i++) {
        if (lines[i].length === 0) {
          continue;
        }

        for (var s = 0; s < indent; s++) {
          lines[i] = ' ' + lines[i];
        }
      }

      conc += lines.join('\n');


      // Dont search in the newly included file
      includeRegex.lastIndex = conc.length-1;
      content = conc + content.substr(match.index + match[0].length);
    }

    return content;
  },

  getLineNumber: function(index, content) {
    count = content.substr(0, index);
    count = count.split('\n');

    return count.length;
  },

  inBranch: function(needle, parent, branch, sparent) {
    var found = false;
    for(var i in branch) {
      if(branch.hasOwnProperty(i)) {
        if(i == needle && parent == sparent) {
          found = true;
          break;
        }

        found = this.inBranch(needle, parent, branch[i], i);
      }
    }

    return found;
  },

  includeRegex: /([ |\t]+)?\/\/=include\s([\w\/\.\#]+)/g
};

var mingler = exports = module.exports = {};

// Mingler properties
mingler._listeners = {
  minify: [],
  concatenate: [],
  complete: [],
  error: [],
  warning: []
};

// Mingler#mingle - Concatenates a file and all its dependencies
mingler.mingle = function(file, callback) {
  process.chdir(path.dirname(file));
  file = path.basename(file);
  exists(file, function(exist) {
    if(!exist) {
      return notify('error', 'File ' + file + ' doesn\'t exist');
    }

    var content = Concatenater.concatenate(file);
    if(typeof callback == 'function') {
      callback(content);
    }

    notify('complete', content);
  });
}

// Mingler#on - Adds an event listener
mingler.on = function(event, listener) {
  if(event in mingler._listeners) {
    mingler._listeners[event].push(listener);
  }
}

// Mingler#un - Removes an event listener
mingler.un = function(event, listener) {
  if(!(event in mingler._listeners)) {
    return false;
  }

  var index = mingler._listeners[event].indexOf(listener);
  if(index != -1) {
    return mingler._listeners[event].splice(index, 1);
  } else {
    mingler._listeners[event] = [];
  }

  return false;
}
