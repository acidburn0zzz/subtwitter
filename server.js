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
    "retweeter"
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
//this is hacky but eh
let tsock = Promise.resolve();
//same
let followings = [];

const organize = tweet => {
    if(tweet.retweeted_status) {
        let retweeter = tweet.user.name;
        //FIXME this is time of rt? they nix the timestamp from the nested status
        //annoying but maybe unavoidable, I don't have the REST calls to burn on lookups
        //check if they provide it in a different field/format, not sure
        tweet.retweeted_status.timestamp_ms = tweet.timestamp_ms;
        tweet = tweet.retweeted_status;
        tweet.retweeter = retweeter;
    }

    tweet = _.pick(tweet, keys);
    tweet.user = _.pick(tweet.user, ukeys);

    return tweet;
};

const sanitize = tweet => {
    tweet = _.mapValues(tweet, (val, key) => {
        if(typeof val == "string") {
            val.replace(/&(?!amp;)/g, "&amp;");
            //FIXME does js let you do this in one pass
            val.replace(/</g, "&lt;");
            val.replace(/>/g, "&gt;");
            val.replace(/'/g, "&#x27;");
            val.replace(/"/g, "&#x22;");
            if(key == "source")
                val = /^<(?:.*?)>(.*)<\/a>$/.exec(val)[1];
            else if(key == "profile_image_url")
                ;
            else
                val.replace(/\//g, "&#x2f;");
        }
            
        return val;
    });

    return tweet;
};

//--------------------------

io.on("connection", socket => {
    tsock = new Promise(Y => Y(socket));
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
    //FIXME ideally we'd check the buffer here so I see retweets of old tweets by friends
    //also FIXME these ifs are absurd make fns imo
    if(tweet.retweeted_status && (tweet.retweeted_status.user.id_str == self || _.indexOf(followings, tweet.retweeted_status.user.id_str, true) != -1))
        return;
    
    tweet = organize(tweet);
    tweet = sanitize(tweet);

    //presently 3x client buffer
    //I... do want it in both places
    //design will eventually be client tells server what filters it wants
    //server returns a new buffer according to those filters
    //server serves new tweets accordingly
    //I thiiiink I want to emit based on column rather than let the client decide
    if(buffer.length > 1500)
        buffer.shift();

    buffer.push(tweet);

    console.log(`buffer: @${tweet.user.screen_name}: ${tweet.text}`);

    if((tweet.user.id_str == self && !tweet.retweeter) || _.indexOf(followings, tweet.user.id_str, true) != -1 || tweet.retweeter) {
        tsock.then(tsock => tsock.emit("timeline", tweet)).catch(err => console.log(err));
        console.log(`timeline: @${tweet.user.screen_name}: ${tweet.text}`);
    }

    if(tweet.in_reply_to_user_id == self && tweet.user.id_str != self) {
        tsock.then(tsock => tsock.emit("mentions", tweet)).catch(err => console.log(err));
        console.log(`mentions : @${tweet.user.screen_name}: ${tweet.text}`);
    }
});

exp.listen(process.env.PORT);
http.listen(process.env.IOPORT);
