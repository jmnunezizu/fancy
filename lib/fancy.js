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

db.run('CREATE TABLE IF NOT EXISTS wishlist (wishlist TEXT, title TEXT, buy TEXT, price REAL, want INTEGER, got INTEGER, priority TEXT)');

exports = module.exports = Fancy;

function Fancy(wishlistId) {
	this.wishlistId = wishlistId;
	this.wishlistUrl = wishlistUrlTemplate.replace('${wishlistId}', wishlistId);
}

Fancy.prototype.update = function(cb) {
	var self = this;
	var items = [];
	var currentPage = 0;
	var totalPages = null;
	async.doWhilst(
		function(done) {
			currentPage++;
			var url = self.wishlistUrl + '&page=' + currentPage;
			console.log('requesting url %s', url);
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
	    	console.log('currentPage %d of totalPages %d', currentPage, totalPages);
	    	return currentPage < totalPages;
	    },
	    function(err) {
	    	db.serialize(function() {
	    		var stmt = db.prepare('INSERT INTO wishlist VALUES (?, ?, ?, ?, ?, ?, ?)');
    			items.forEach(function(item) {
    				stmt.run(self.wishlistId, item.title, item.buy, item.price, item.want, item.got, item.priority);
    			});

    			stmt.finalize();
    			cb(null, { totalItems: items.length });
    			//db.close();
	    	});
	    }
    );
};

Fancy.prototype.list = function(query, cb) {
	var searchQuery = 'SELECT title, price FROM wishlist';
	if (query) {
		searchQuery += " WHERE title like '%" + query + "%'";
	}

	db.all(searchQuery, cb);
};

processItems = function(data) {
	var items = [];
	$('.compact-items').find('.itemWrapper tr').each(function(i, itemRow) {
		var itemProperties = $(this).children();
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
