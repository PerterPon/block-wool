
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
import * as path from 'path';
import "colors";

import { CoreOptions, Response } from 'request';
import { TListItem, THttpResponse, TCanStealCoin, TStealResult, TMineCoin } from 'main-types';

const Authorization: string = process.argv[ 2 ];
const UserId: string = process.argv[ 3 ];

const getPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.get );
const postPromise: ( uri: string, options: CoreOptions ) => Promise<Response> = util.promisify<string, CoreOptions, Response>( request.post );

const headers: CoreOptions = {
    headers : {
        Authorization: Authorization,
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
        const mines: Array<TMineCoin> = await getMysqlSelfCoinList();

        for( let i = 0; i < mines.length; i ++ ) {
            const mineCoin: TMineCoin = mines[ i ];
            const validTime: number = mineCoin.validTime;
            if ( validTime <= Date.now() ) {
                await getMinedCoin( mineCoin );
            }
        }

        await randomSleep();
        const data: Array<TListItem> = await getList();
        let haveStealCoin: boolean = false;
        for( let i = 0; i < data.length; i ++ ) {
            const item: TListItem = data[ i ];
            if( true === item.canSteal ) {
                haveStealCoin = true;
                await randomSleep();
                const stealCoins: Array<TCanStealCoin> = await listCanStealCoins( item.userId );
                for ( let j = 0; j < stealCoins.length; j ++ ) {
                    const canStealCoin: TCanStealCoin = stealCoins[ j ];
                    if ( true === canStealCoin.canSteal ) {
                        await stealCoin( item.userId, canStealCoin );
                    }
                }
            }
        }
        if ( false === haveStealCoin ) {
            emptyTimes ++;
        }

    }

}

let change: string = 'false';
let emptyTimes: number = 0;
async function getList(): Promise<Array<TListItem>> {
    if ( 20 >= emptyTimes ) {
        change = 'true';
    }
    const url: string = `https://blockcity.gxb.io/miner/steal/user/list?change=${ change }&hasLocation=true`;
    
    emptyTimes = 0;
    change = 'false';

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
        await store( 'steal', canStealCoin.symbol, resData.data.stealAmount );
    } else {
        throw new Error( resData.message );
    }

}

async function getMysqlSelfCoinList(): Promise<Array<TMineCoin>> {

    const url: string = `https://blockcity.gxb.io/miner/${ UserId }/mine/list/v2`;
    const res: Response = await getPromise( url, headers );
    const resData: THttpResponse<{ mines: Array<TMineCoin> }> = JSON.parse( res.body );
    const mines: Array<TMineCoin> = resData.data.mines;

    if ( null === resData.message ) {
        return resData.data.mines;
    } else {
        throw new Error( resData.message );
    }

}

async function getMinedCoin( mineCoin: TMineCoin ): Promise<void> {

    console.log( `getting mined coin: [${ mineCoin.symbol }], amount: [${ mineCoin.amount }]` );
    const url: string = `https://blockcity.gxb.io/miner/${ UserId }/mine/${ mineCoin.id }/v2`;
    const res: Response = await getPromise( url, headers );
    const resData: THttpResponse<{ drawAmount: number }> = JSON.parse( res.body );

    if ( null === resData.message ) {
        await store( 'mine', mineCoin.symbol, resData.data.drawAmount );
    } else {
        throw new Error( resData.message );
    }

}

async function store( type: 'steal'|'mine', symbol: string, amount: number ): Promise<void> {
    console.log( `[${ moment().format( 'YYYY-MM-DD HH:mm:ss' ) }] store new coin: [${ symbol }], amount: [ ${ amount } ]` );

    // const stoneFile: string = "~/Documents/Project/block-wool/src/count.json";
    const stoneFile: string = path.join( __dirname, '../../count.json' );
    const file: string = fs.readFileSync( stoneFile, 'utf-8' );
    try {
        const store: { steal: { [ name: string ] : number }, mine: { [name: string] : number } } = JSON.parse( file ) || {};
        const target: { [name: string] : number } = store[ type ];
        const nowCount: number = target[ symbol ] || 0;
        target[ symbol ] = nowCount + amount;
        fs.writeFileSync( stoneFile, JSON.stringify( store, <any>'', 2 ) );
    } catch( e ) { console.error(  e.message.red ); }

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
