function encode(data) {
    var type = data.kind;
    if(type == "write") {
        /*
            0x00, tileY, tileX, charY, charX, date, char, id, color, animation
        */
    }
}

function decode(data) {

}
/*

write - 'w'
fetch - 'f'
link - 'l'
paste - 'P'
protect - 'p'
chat - 'c'
chathistory - 'h'
cmd - 'C'
cmd_opt - 'o'

clear_tile - 'x'
debug - 'D'
set_tile - 'S'

--------------------

0x01 = to server, 0x02 = from server
type [wflPpchCoxDS]
... packet specific data at this point ...

*/

module.exports = {
    encode,
    decode
};