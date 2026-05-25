console.time('test');

let result = [];
for(let i = 0; i < 1000000; i++){
    let num =2;
    let flt = true;
    while(num < i){
        if(i % num === 0){
            flg = false;
            break;
    }
    num++;

}
if(flt){
    result.push(i);
}
}
console.log(result);
console.timeEnd('test');
