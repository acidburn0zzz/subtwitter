"use strict";

if(process.env.NODE_ENV != "production")
	require("dotenv").load();

const _ = require("lodash");
const Promise = require("bluebird");
const Twit = require("twit");

const express = require("express");
const exp = express();
exp.use(express.static("web"));

//FIXME new express doesn't have createServer() anymore
//there's prolly a fn to do this on the same port
//look it up later
const http = require("http").createServer();
const io = require("socket.io")(http);

const T = new Twit({
	consumer_key: process.env.TWITTER_KEY,
	consumer_secret: process.env.TWITTER_SECRET,
	access_token: process.env.TWITTER_TOKEN,
	access_token_secret: process.env.TWITTER_TOKEN_SECRET
});

const self = /^[0-9]*/.exec(process.env.TWITTER_TOKEN);

const htmlEscapes = {
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#x27;",
    '"': "&#x22;"
};

const keys = [
	"id_str",
	"text",
	"source",
	"in_reply_to_status_id_str",
    "in_reply_to_user_id",
    "in_reply_to_screen_name",
	"user",
	"timestamp_ms",
    //custom
    "retweeter",
    "extras",
    "in_reply_to_name",
];

const ukeys = [
	"id_str",
	"name",
	"screen_name",
	"description",
	"verified",
    "protected",
	"profile_image_url"
];

let buffer = [];

//FIXME(?) this is hacky but eh
//basically I set these from callbacks on init
//so I don't have to use promise semantics everywhere
//there's prolly a more sensible way w/ generators or smth
//alternatively I guess I could move the processing into a Promise.all?
//ehhh... think about it. works fine atm tho
//"works fine" means if the resource is not there yet the stream callback fails gracefully
//I want to archive my tweets with postgres later on so mm
//this decoupling of the stream and the socket _is_ desirable
//ooh actually the right thing to do is just explicitly handle the case of no clients
//and have socket on disconnect put us back in that state
//and I can run this on another computer and just hook in whenever, like I do with irc
//yes good excellent TODO do that
let tsock = Promise.resolve();
let followings = [];
let feed = [];

const organize = tweet => {
    if(tweet.retweeted_status) {
        //FIXME this is time of rt? they nix the timestamp from the nested status
        //annoying but maybe unavoidable, I don't have the REST calls to burn on lookups
        //check if they provide it in a different field/format, not sure
        tweet.retweeted_status.timestamp_ms = tweet.timestamp_ms;
        tweet.retweeted_status.retweeter = tweet.user.name;
        tweet = tweet.retweeted_status;
    }

    //cleaner than the rats' nest of ifs it used to be but eh
    //this works for "real" replies (eg, reply w/ mention)
    //and also self-threading
    //nuclear option would be just do a GET if neither of those work
    //but let's not, I think this should result in a display name 99%+
    tweet.in_reply_to_name = (tweet => {
        if(!tweet.in_reply_to_screen_name)
            return null;
        if(tweet.in_reply_to_screen_name == tweet.user.screen_name)
            return tweet.user.name;

        let mention = _.find(tweet.entities.user_mentions, item =>
            item.screen_name == tweet.in_reply_to_screen_name);
        if(mention)
            return mention.name;

        return `@${tweet.in_reply_to_screen_name}`;
    })(tweet);
        
    tweet = _.pick(tweet, keys);
    tweet.user = _.pick(tweet.user, ukeys);

    return tweet;
};

const sanitize = tweet => {
    tweet = _.mapValues(tweet, (val, key) => {
        if(key == "source") {
            val = /^<(?:.*?)>(.*)<\/a>$/.exec(val)[1];
            return val;
        }

        if(typeof val == "string") {
            val = val.replace(/&(?!amp;)/g, "&amp;");
            val = val.replace(/[<>'"]/g, match => htmlEscapes[match]);
        /* FIXME hilariously, fixing this breaks my link replacer
            if(key == "profile_image_url")
                ;
            else
                val = val.replace(/\//g, "&#x2f;");
        */
        }
            
        return val;
    });

    return tweet;
};

//entities => hashtags, urls, user_mentions, symbols can exist as empty arrays
//extended_entities or media do not exist when empty
//quoted tweets get embedded... somewhere, didn't test that one
const enhance = tweet => {
    let extras = {};

    //TODO hashtags
    if(tweet.entities.user_mentions.length > 0) {
        let mentions = _.map(tweet.entities.user_mentions, item => {
            return {
                id_str: item.id_str,
                name: item.name,
                screen_name: item.screen_name
            };
        });

        if(mentions.length > 0)
            extras.mentions = mentions;
    }

    if(tweet.entities.urls.length > 0) {
        let urls = _.map(tweet.entities.urls, item => {
            return {
                text: item.url,
                pretty: item.display_url,
                real: item.expanded_url
            };
        });

        if(urls.length > 0)
            extras.urls = urls;
    }

    //this prolly has stuff like vine/soundcloud/video/etc too
    //FIXME this doesn't work for gifs, which twitter reencodes as mp4
    //just grabs the thumbnail image they generate
    if(tweet.entities.media) {
        let photos = _(tweet.entities.media)
            .filter(item => item.type == "photo")
            .map(item => {
                return {
                    text: item.url,
                    pretty: item.display_url,
                    real: item.media_url_https
                };
            })
            .value();
        if(photos.length > 0)
            extras.photos = photos;
    }

    return extras;
};

const toTimeline = tweet => {
    //tweets by me, but not retweets of me
    if(tweet.user.id_str == self && !tweet.retweeter)
        return true;
    //tweets by my followings
    if(_.indexOf(followings, tweet.user.id_str, true) != -1)
        return true;
    //retweets
    if(tweet.retweeter)
        return true;

    return false;
};

const toFeed = tweet => {
    //tweets by those on my feed list
    if(_.indexOf(feed, tweet.user.id_str, true) != -1)
        return true;

    return false;
};

const toMentions = tweet => {
    //replies to my tweets, but not replies by me
    if(tweet.in_reply_to_user_id == self && tweet.user.id_str != self)
        return true;
    //mentions of me
    if(_.any(tweet.extras.mentions, item => item.id_str == self))
        return true;

    return false;
};

//TODO ideally this would dump buffer duplicates
//but... dunno about performance. or, well...
//if we keep a separate array of just ids it's O(log n) worst case
//if we don't it's O(n) unless I add something to the mixin
//since map is eager and any/find don't have a binary search option
//maybe it doesn't matter and 1500 isn't "a lot" to step thru
//but I don't want to get bogged down on high tweet volume
const toTheBin = tweet => {
    //retweets that also...
    if(tweet.retweeted_status) {
        //...are of me
        if(tweet.retweeted_status.user.id_str == self)
            return true;
        //...or someone I follow
        if(_.indexOf(followings, tweet.retweeted_status.user.id_str, true) != -1)
            return true;
    }

    return false;
};

//--------------------------

exp.get("/io/port", (req, res) => {
    res.send({ port: process.env.IOPORT });
});

io.on("connection", socket => {
    tsock = new Promise(Y => Y(socket));

    //proof of concept, need a way to get list members I don't follow too
    //perhaps search stream, perhaps secret account for second user stream
    //conveniently thanks to my if logic this ignores their RTs
    //but captures RTs of them
    if(process.env.FEED_LIST) {
        T.get("lists/members", {
            owner_id: self,
            slug: process.env.FEED_LIST,
            count: 256,
            include_entities: false,
            skip_status: true
        }, (err, data) => {
            if(err) {
                console.log(`failed to get list ${process.env.FEED_LIST}`);
                return;
            }

            feed = _(data.users).map(user => user.id_str).sortBy().value();
        });
    }

    socket.emit("join", "hello alice!");

    if(buffer.length > 0)
        socket.emit("timeline", buffer[buffer.length - 1]);

    socket.on("like", id_str => {
        T.post("favorites/create", { id: id_str }, err =>
            err ? socket.emit("log", err) : socket.emit("log", `liked ${id_str}`));
    });

    socket.on("unlike", id_str => {
        T.post("favorites/destroy", { id: id_str }, err =>
            err ? socket.emit("log", err) : socket.emit("log", `unliked ${id_str}`));
    });

    socket.on("retweet", id_str => {
        T.post("statuses/retweet/:id", { id: id_str }, err =>
            err ? socket.emit("log", err) : socket.emit("log", `retweeted ${id_str}`));
    });

    socket.on("unretweet", id_str => {
        T.get("statuses/show/:id", { id: id_str, include_my_retweet: true }, (err, data) => {
            if(err) {
                socket.emit("log", err);
                return;
            }
                
            T.post("statuses/destroy/:id", { id: data.current_user_retweet.id_str }, err =>
                err ? socket.emit("log", err) : socket.emit("log", `unretweeted ${id_str}`));
        });
    });
});

const stream = T.stream("user", { stringify_friend_id: true });

stream.on("connected", () =>
    console.log("stream open\nlistening..."));
stream.on("friends", preamble =>
    followings = _.sortBy(_.map(preamble.friends, f => f.toString())));

stream.on("tweet", tweet => {
    //if(tweet.user.id_str == self)
        //console.log("test test:\n"+JSON.stringify(tweet, null, "\t"));

    //FIXME ideally we'd check the buffer here so I see retweets of old tweets by friends
    if(toTheBin(tweet))
        return;

    let extras = enhance(tweet.retweeted_status || tweet);
    tweet = organize(tweet);
    tweet = sanitize(tweet);
    tweet.extras = extras;
    
    //console.log(JSON.stringify(tweet, null, "\t"));

    //presently 3x client buffer
    //I... do want it in both places
    //design will eventually be client tells server what filters it wants
    //server returns a new buffer according to those filters
    //server serves new tweets accordingly
    //I thiiiink I want to emit based on column rather than let the client decide
    //
    //update... I need to do a tree I think
    //maybe, replies look for their direct parent in the buffer
    //binary search? better perf prolly with... something weighted toward end?
    //anyway, stores a pointer, either null or an index offset
    //or hm if it stores a reference and... wait, testing
    //ok sweet so, if I store a "parent" ref it's not GCed when original is shifted off
    //so do that, click a tweet and its thread is shown
    //for deadends before top-level, have a "fetch thread" button to do GETs
    //incidentally I should also write a wrapper that checks ratelimit first
    if(buffer.length > 1500)
        buffer.shift();

    buffer.push(tweet);

    console.log(`\n@${tweet.user.screen_name}: ${tweet.text}\n  => buffer`);

    if(toTimeline(tweet)) {
        tsock.then(tsock => tsock.emit("timeline", tweet)).catch(err => console.log(err));
        console.log("  => timeline");
    }

    if(toFeed(tweet)) {
        tsock.then(tsock => tsock.emit("feed", tweet)).catch(err => console.log(err));
        console.log("  => feed");
    }

    if(toMentions(tweet)) {
        tsock.then(tsock => tsock.emit("mentions", tweet)).catch(err => console.log(err));
        console.log("  => mentions");
    }
});


console.log(`subtwitter v${require("./package.json").version}`);
console.log(`${new Date().toISOString()}`);
console.log(`server @ ${require("os").hostname()}:${process.env.PORT}`);
console.log(`socket @ ${require("os").hostname()}:${process.env.IOPORT}`);

exp.listen(process.env.PORT);
http.listen(process.env.IOPORT);
