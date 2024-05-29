const express = require('express');

const getCurrentTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const loggingMiddleware = (req, res, next) => {
    // Capture the request body
    if (req.body) {
        console.log(`${getCurrentTimestamp()}\t${req.url} Request Body: ${JSON.stringify(req.body, null, 2)}`);
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

        console.log(`${getCurrentTimestamp()}\tResponse Body: ${body}`);

        defaultEnd.apply(res, restArgs);
    };

    next();
};

module.exports = loggingMiddleware;
