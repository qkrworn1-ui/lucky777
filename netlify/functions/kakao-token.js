const https = require('https');
const querystring = require('querystring');

const KAKAO_JS_KEY = 'c40e8adc700a6f1c1e62b6aa3fa0c60a';

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const params = event.queryStringParameters || {};
    let postBody = {};
    if (event.body) {
        try {
            postBody = JSON.parse(event.body);
        } catch(e) {
            postBody = querystring.parse(event.body);
        }
    }

    const code = params.code || postBody.code;
    const redirect_uri = params.redirect_uri || postBody.redirect_uri || 'https://sonamu-jokgu-club.web.app/';

    if (!code) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'code parameter required' })
        };
    }

    const requestData = querystring.stringify({
        grant_type: 'authorization_code',
        client_id: KAKAO_JS_KEY,
        redirect_uri: redirect_uri,
        code: code
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'kauth.kakao.com',
            port: 443,
            path: '/oauth/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'Content-Length': Buffer.byteLength(requestData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers,
                    body: body
                });
            });
        });

        req.on('error', (err) => {
            resolve({
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: err.message })
            });
        });

        req.write(requestData);
        req.end();
    });
};
