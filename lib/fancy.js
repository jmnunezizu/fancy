var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('underscore');
var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');
var wishlist = require('./amazon-wishlist');

var wishlistUrlTemplate = 'http://www.amazon.co.uk/registry/wishlist/${wishlistId}?layout=compact'

var file = 'db/fancy.db';
var dbExists = fs.existsSync(file);
var db = new sqlite3.Database(file);

exports = module.exports = Fancy;

function Fancy(wishlistId) {
    EventEmitter.call(this);
    this.wishlistId = wishlistId;

    var self = this;
    process.nextTick(function() {
        if (!dbExists) {
            fs.readFile('db/schema.sql', 'utf8', function(err, schema) {
                if (err) throw err;
                db.exec(schema, function(err) {
                    if (err) throw err;
                    self.emit('ready');
                });
            })
        } else {
            self.emit('ready');
        }
    });
}

/**
 * Inherit from EventEmitter.
 */
util.inherits(Fancy, EventEmitter);

Fancy.prototype.update = function(cb) {
    var self = this;
    wishlist('compact', { wishlistId: this.wishlistId }, function(err, items) {
        db.serialize(function() {
            db.run('INSERT into updates (datetime, wishlist, totalitems) VALUES (datetime(), :wishlistId, :totalItems)', [self.wishlistId, items.length], function(err) {
                if (err) return cb(err);
                var updateId = this.lastID;

                var stmt = db.prepare('INSERT INTO wishlist (update_id, wishlist, datetime, title, link, buy, price, want, got, priority) VALUES (?, ?, datetime(), ?, ?, ?, ?, ?, ?, ?)');
                items.forEach(function(item) {
                    stmt.run(updateId, self.wishlistId, item.title, item.link, item.buy, item.price, item.want, item.got, item.priority);
                });

                stmt.finalize();
                cb(null, { totalItems: items.length });
                //db.close();
            });
        });
    });
};

Fancy.prototype.list = function(query, cb) {
    var searchQuery = 'SELECT title, price FROM wishlist WHERE update_id = (select max(rowid) from updates)';
    if (query) {
        if (/^price\:/.test(query)) {
            var priceFilter = query.split(':');
            if (priceFilter[1] === 'max') {
                searchQuery += " AND price = (SELECT MAX(price) FROM wishlist WHERE update_id = (select max(rowid) from updates))";
            } else if (priceFilter[1] === 'min') {
                searchQuery += " AND price = (SELECT MIN(price) FROM wishlist WHERE update_id = (select max(rowid) from updates))"
            } else if (priceFilter[1].indexOf('..') >= 0) {
                priceRange = priceFilter[1].split('..');
                if (priceRange[0] === '') {
                    searchQuery += " AND price <= " + priceRange[1];
                } else if (priceRange[1] === '') {
                    searchQuery += " AND price >= " + priceRange[0];
                } else {
                    searchQuery += ' AND price between ' + priceRange[0] + ' and ' + priceRange[1];
                }
            } else {
                console.log('not implemented yet');
            }
        } else {
            searchQuery += " AND title like '%" + query + "%'";
        }
    }

    //console.log(searchQuery);

    db.all(searchQuery, cb);
};

Fancy.prototype.stats = function(cb) {
    var self = this;
    db.get('select wishlist, datetime as lastupdated, totalitems from updates where rowid = (select max(rowid) from updates);', function(err, row) {
        if (err) return cb(err);

        if (row) {
            cb(null, {
                wishlistUrl: 'http://www.amazon.co.uk/registry/wishlist/' + self.wishlistId,
                totalItems: row.totalitems,
                lastUpdated: row.lastupdated
            });
        } else {
            cb(null, {
                wishlistUrl: 'http://www.amazon.co.uk/registry/wishlist/' + self.wishlistId,
                totalItems: 0,
                lastUpdated: 'Update has never been run'
            });
        }
    });
};
