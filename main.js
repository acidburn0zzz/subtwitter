"use strict";

const _ = require("lodash");
const Promise = require("bluebird");
const Twit = require("twit");

if(process.env.NODE_ENV != "production")
	require("dotenv").load();

const T = new Twit({
	consumer_key: process.env.TWITTER_KEY,
	consumer_secret: process.env.TWITTER_SECRET,
	access_token: process.env.TWITTER_TOKEN,
	access_token_secret: process.env.TWITTER_TOKEN_SECRET
});

T.post("statuses/update", { status: "Hello World!" }, _.noop);
