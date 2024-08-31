var path = require("path");
var webpack = require("webpack");

module.exports = {
	entry: "./src/index.ts",
	devtool: "inline-source-map",
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
	},
	plugins: [
		new webpack.DefinePlugin({
			IS_DEV: JSON.stringify(true)
		})
	],
	output: {
		filename: "bundle.js",
		path: path.resolve(__dirname, "dist"),
	},
	mode: "development"
};