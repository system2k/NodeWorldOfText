module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var blocks = ws.sdata.chat_blocks;

	if (typeof data.all == "boolean") blocks.block_all = data.all;
	if (typeof data.tell == "boolean") blocks.no_tell = data.tell;
	if (typeof data.anon == "boolean") blocks.no_anon = data.anon;
	if (typeof data.reg == "boolean") blocks.no_reg = data.reg;
}
