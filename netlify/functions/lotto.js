const https = require('https');

exports.handler = async function(event, context) {
    const params = event.queryStringParameters || {};
    const round = params.round || params.drwNo || params.srchLtEpsd || '1237';

    return new Promise((resolve) => {
        const timestamp = Date.now();
        const url = `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${round}&_=${timestamp}`;
        
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.dhlottery.co.kr/lt645/resultPstLt645.do',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type',
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    body: body
                });
            });
        });
        req.on('error', (err) => {
            resolve({
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: err.message })
            });
        });
    });
};
