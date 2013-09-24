var EventEmitter = require('events').EventEmitter;
var util = require('util');
var request = require('request');
var cheerio = require('cheerio');
var async = require('async');

function processItems(data) {
    var items = [];
    $('.compact-items').find('.itemWrapper').each(function(i, itemRow) {
        var itemProperties = $(this).children().last().find('td');

        var item = {
            title: $(itemProperties[0]).find('.productTitle a').text() + $(itemProperties[0]).find('span.tiny').text(),
            link: $(itemProperties[0]).find('.productTitle a').attr('href'),
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

function CompactWishlist(options) {
    EventEmitter.call(this);
    this.wishlistId = options.wishlistId;
    var wishlistUrlTemplate = 'http://www.amazon.co.uk/registry/wishlist/${wishlistId}?layout=compact'
    this.wishlistUrl = wishlistUrlTemplate.replace('${wishlistId}', this.wishlistId);

    var self = this;
    this.callback = options.callback;

    self.on('error', self.callback.bind());
    self.on('complete', self.callback.bind(self, null));

    process.nextTick(function() {
        self.get();
    });
}

/**
 * Inherit from EventEmitter.
 */
util.inherits(CompactWishlist, EventEmitter);

CompactWishlist.prototype.get = function() {
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
                    console.log('Processed %d items on page %d', newItems.length, currentPage);
                    items = items.concat(newItems);
                    
                    done();
                }
            });
        },
        function() {
            return currentPage < totalPages;
        },
        function(err) {
            if (err) return self.emit('error', err);

            self.emit('complete', items);
        }
    );
};

function wishlist(type, options, callback) {
    if (callback) {
        options.callback = callback;
    }

    var wishlist = null;
    if ('compact' === type) {
        wishlist = new CompactWishlist(options);
    } else if ('normal' === type) {

    } else {
        throw new Error('unsupported type ' + type);
    }

    return wishlist;
};

module.exports = wishlist;
wishlist.CompactWishlist = CompactWishlist;
