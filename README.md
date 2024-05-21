# Our World Of Text #

## Software Requirements

* Node.js (>18.x.x) ( https://nodejs.org/ )
* Git ( https://git-scm.com/ )
    * Not strictly necessary, but it's convenient for quickly downloading and updating your local repository.

## Quickstart
* Clone the OWOT repository
    * `git clone https://github.com/system2k/nodeworldoftext.git nwot`
* Navigate to the directory
    * `cd nwot`
* Install the dependencies
    * `npm install`
* When running the server for the first time, you'll be asked to configure the settings. After doing so, run the command again. NOTE: This will create a 'nwotdata' directory on the same level as your repository.
    * `node main.js`
* You'll then be prompted to create a superuser account. You may see this message:
    * "You've just installed the server,
which means you don't have any superusers defined.
Would you like to create one now? (yes/no):"
    * A superuser account (i.e. administrator account) can be used to manage your instance using the web interface.
* After everything has been set up, your server may be live at this address:
    * `http://localhost:8080`

## Common Issues
* If you're encountering issues with `nwot_error_logs.zip`, please delete the zip file and try again.
* If you're receiving node-gyp errors while installing the modules via NPM, please ensure you've got some compiling tools installed on your system. If you have any further questions, be sure to ask us on Discord.
* If you're receiving an error saying `Cannot find module`, make sure you've installed the modules by running `npm install`.

## License
Our World of Text is licensed under the [MIT License](https://github.com/system2k/nodeworldoftext/blob/master/LICENSE).

## Links
* [Our World of Text](https://ourworldoftext.com)
* [Our World of Text Wiki](https://wiki.ourworldoftext.com)
* [Our World of Text Discord](https://discord.gg/aqgH45B6W3)
