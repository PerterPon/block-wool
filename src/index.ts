
/*
* Index
* Author: PerterPon@gmail.com
* Create: Fri Jun 22 2018 15:21:06 GMT+0800 (CST)
*/

// import { request, RequestOptions } from 'http';
import * as request from 'request';
import * as fs from 'fs-extra';
import * as moment from 'moment';
import * as util from 'util';
import "colors";

import { CoreOptions, Response } from 'request';
import { TListItem, THttpResponse, TCanStealCoin, TStealResult } from 'main-types';

const getPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.get );
const postPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.post );

const headers: CoreOptions = {
    headers : {
        Authorization: process.argv[ 2 ],
        Host: 'walletgateway.gxb.io',
        Origin: 'https://blockcity.gxb.io',
        "Accept-Encoding": "br, gzip, deflate",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E302 (5880463872)",
        "Referer": "https://blockcity.gxb.io/",
        "Accept-Language": "zh-CN"
    }
};

function sleep( time: number ): Promise<void> {

    return new Promise<void>( ( resolve, reject ) => {
        setTimeout( resolve, time );
    } );

}

async function randomSleep(): Promise<void> {
    await sleep( Math.random() * 10 * 1000 );
}

async function start(): Promise<void> {

    while( true ) {
        await randomSleep();
        const data: Array<TListItem> = await getList();

        for( let i = 0; i < data.length; i ++ ) {
            const item: TListItem = data[ i ];
            if( true === item.canSteal ) {
                await randomSleep();
                const stealCoins: Array<TCanStealCoin> = await listCanStealCoins( item.userId );
                for ( let j = 0; j < stealCoins.length; j ++ ) {
                    const canStealCoin: TCanStealCoin = stealCoins[ j ];
                    if ( true === canStealCoin.canSteal ) {
                        await randomSleep();
                        await stealCoin( item.userId, canStealCoin );
                    }
                }
            }
        }

    }

}

let change: string = 'true';

async function getList(): Promise<Array<TListItem>> {
    console.log( 'getting user list...'.yellow );
    const url: string = `https://blockcity.gxb.io/miner/steal/user/list?change=${ change }&hasLocation=true`;
    const res: Response = await getPromise( url, headers );
    const resData: THttpResponse<Array<TListItem>> = JSON.parse( res.body );

    let data: Array<TListItem> = [];

    if ( null === resData.message ) {
        data = resData.data;
    } else {
        throw new Error( resData.message );
    }

    return data;
}

async function listCanStealCoins( userId: string ): Promise<Array<TCanStealCoin>> {

    console.log( 'getting can steal coins...'.yellow );
    const url: string = `https://blockcity.gxb.io/miner/steal/${ userId }/mine/list`;
    const res: Response  = await getPromise( <any>url, <any>headers );
    const resData: THttpResponse<Array<TCanStealCoin>> = JSON.parse( res.body );

    let data: Array<TCanStealCoin> = [];

    if( null === resData.message ) {
        data = resData.data;
    } else {
        throw new Error( resData.message );
    }

    return data;
}

async function stealCoin( userId: string, canStealCoin: TCanStealCoin ): Promise<void> {

    console.log( 'stealing coin ...'.yellow );
    const url: string = `https://blockcity.gxb.io/miner/steal/${ userId }/mine/${ canStealCoin.mineId }`;
    const res: Response = await postPromise( <any>url, <any>headers );
    const resData: THttpResponse<TStealResult> = JSON.parse( res.body );

    if ( null === resData.message ) {
        await store( canStealCoin, resData.data );
    } else {
        throw new Error( resData.message );
    }

}

async function store( canStealCoin: TCanStealCoin, result: TStealResult ): Promise<void> {

    console.log( `[${ moment().format( 'YYYY-MM-DD HH:mm:ss' ) }] steal new coin: [${ canStealCoin.symbol }] amount: [${ result.stealAmount }]`.green );

    const stoneFile: string = "/Users/Pon/Documents/Project/block-wool/src/count.json";
    const file: string = fs.readFileSync( stoneFile, 'utf-8' );

    try {
        const stone: { [name: string]: any }  = JSON.parse( file ) || {};
        const { symbol } = canStealCoin;
        const { stealAmount } = result;
        const nowCount: number = stone[ symbol ] || 0;
        stone[ symbol ] = nowCount + stealAmount;
        fs.writeFileSync( stoneFile, JSON.stringify( stone, <any>'', 2 ) );
    } catch( e ) { console.error( e.message.red ); }

}

async function startShell(): Promise<void> {

    try {
        await start();
    } catch( e ) {
        console.error( e );
        console.error( 'waiting for restart ...'.red );
        setTimeout( startShell, 5 * 1000 );
    }

}

startShell();

process.on( 'uncaughtException', ( error: Error ) => {
    console.error( `uncaughtException\n${ error.message }\n${ error.stack }`.red );
} );

process.on( 'unhandledRejection', () => {
    console.error( 'unhandledRejection'.red );
} );
