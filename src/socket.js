ajax("GET", "/io/port").then(res => {
    socket = io.connect(`http://localhost:${res.port}`);

    socket.on("join", msg => {
        console.log(msg);
    });

    socket.on("log", msg => {
        console.log(msg);
    });

    socket.on("timeline", tweet => {
        console.log(tweet);
        streams.truncate();

        streams.timeline.buffer.push(tweet);
        timeline.insertBefore(buildTweet(tweet, "timeline"), timeline.firstChild);
    });

    socket.on("feed", tweet => {
        console.log(tweet);
        streams.truncate();

        streams.feed.buffer.push(tweet);
        feed.insertBefore(buildTweet(tweet, "feed"), feed.firstChild);
    });

    socket.on("mentions", tweet => {
        console.log(tweet);
        streams.truncate();

        streams.mentions.buffer.push(tweet);
        mentions.insertBefore(buildTweet(tweet, "mentions"), mentions.firstChild);
    });
});
