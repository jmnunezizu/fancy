var EventEmitter = require('events').EventEmitter;
var util = require('util');
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var _ = require('underscore');
var sqlite3 = require('sqlite3').verbose();
var fs = require('fs');

var wishlistUrlTemplate = 'http://www.amazon.co.uk/registry/wishlist/${wishlistId}?layout=compact'

var file = 'db/fancy.db';
var dbExists = fs.existsSync(file);
var db = new sqlite3.Database(file);

processItems = function(data) {
	var items = [];
	$('.compact-items').find('.itemWrapper').each(function(i, itemRow) {
		var itemProperties = $(this).children().last();
		var item = {
			title: $(itemProperties[0]).find('.productTitle a').text() + $(itemProperties[0]).find('span.tiny').text(),
			buy: $(itemProperties[1]).find('span a span').attr('alt'),
			price: parseFloat($(itemProperties[2]).text().replace('£', '')),
			want: parseInt($(itemProperties[3]).text()),
			got: parseInt($(itemProperties[4]).text()),
			priority: $(itemProperties[5]).text()
		};
		
		items.push(item);
	});

	return items;
};

exports = module.exports = Fancy;

var schema = [
	'CREATE TABLE IF NOT EXISTS updates (datetime TEXT, wishlist TEXT, totalitems INTEGER)',
	'CREATE TABLE IF NOT EXISTS wishlist (update_id INTEGER, wishlist TEXT, datetime TEXT, title TEXT, buy TEXT, price REAL, want INTEGER, got INTEGER, priority TEXT)',
];

function Fancy(wishlistId) {
	EventEmitter.call(this);

	this.wishlistId = wishlistId;
	this.wishlistUrl = wishlistUrlTemplate.replace('${wishlistId}', wishlistId);

	var self = this;
	db.exec(schema.join('; '), function(err) {
		if (err) console.log(err);
		self.emit('ready');
	});
}

/**
 * Inherit from EventEmitter.
 */
util.inherits(Fancy, EventEmitter);

Fancy.prototype.update = function(cb) {
	var self = this;
	var items = [];
	var currentPage = 0;
	var totalPages = null;
	async.doWhilst(
		function(done) {
			currentPage++;
			var url = self.wishlistUrl + '&page=' + currentPage;
			//console.log('requesting url %s', url);
	    	request(url, { encoding: 'binary' }, function(err, resp, body) {
	    		if (!err && resp.statusCode === 200) {
	    			$ = cheerio.load(body);
	    			totalPages = parseInt($('.num-pages').text());

	    			var newItems = processItems($);
	    			console.log('Processed %d items in page %d', newItems.length, currentPage);
	    			items = items.concat(newItems);
	    			
	    			done();
	    		}
	    	});
	    },
	    function() {
	    	//console.log('currentPage %d of totalPages %d', currentPage, totalPages);
	    	return currentPage < totalPages;
	    },
	    function(err) {
	    	db.serialize(function() {
	    		db.run('INSERT into updates VALUES (datetime(), :wishlistId, :totalItems)', [self.wishlistId, items.length], function(err) {
	    			if (err) return cb(err);
	    			var updateId = this.lastID;

	    			var stmt = db.prepare('INSERT INTO wishlist VALUES (?, ?, datetime(), ?, ?, ?, ?, ?, ?)');
	    			items.forEach(function(item) {
	    				stmt.run(updateId, self.wishlistId, item.title, item.buy, item.price, item.want, item.got, item.priority);
	    			});

	    			stmt.finalize();
	    			cb(null, { totalItems: items.length });
	    			//db.close();
	    		});
	    	});
	    }
    );
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
	db.get('select wishlist, datetime as lastupdated, totalitems from updates where rowid = (select max(rowid) from updates);', function(err, row) {
		if (err) return cb(err);
		cb(null, {
			wishlistUrl: 'http://www.amazon.co.uk/registry/wishlist/' + row.wishlist,
			totalItems: row.totalitems,
			lastUpdated: row.lastupdated
		});
	});
};
