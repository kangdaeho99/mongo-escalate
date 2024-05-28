const express = require('express');

const loggingMiddleware = (req, res, next) => {
    // Capture the request body
    if (req.body) {
        console.log(`${req.url} Request Body: ${JSON.stringify(req.body, null, 2)}`);
    }

    const defaultWrite = res.write;
    const defaultEnd = res.end;
    const chunks = [];

    res.write = (...restArgs) => {
        chunks.push(Buffer.from(restArgs[0]));
        defaultWrite.apply(res, restArgs);
    };

    res.end = (...restArgs) => {
        if (restArgs[0]) {
            chunks.push(Buffer.from(restArgs[0]));
        }
        const body = Buffer.concat(chunks).toString('utf8');

        console.log(`Response Body: ${body}`);

        defaultEnd.apply(res, restArgs);
    };

    next();
};

module.exports = loggingMiddleware;
