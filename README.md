# quick-transfer [![Build Status](https://travis-ci.org/CodeMan99/quick-transfer.svg?branch=master)](https://travis-ci.org/CodeMan99/quick-transfer)

A one-time file server that displays a QR code to allow your mobile device to get the download URL.

## Install

    npm install -g quick-transfer

## Usage

Provide a filename as the first (non-option) argument to serve that file.

    quick-transfer shopping-list.txt

Provide multiple filenames to create and serve a zip archive.

    quick-transfer notes01.txt notes02.txt notes03.txt

Pipe data to stdin to serve as "stdin.txt". Note that stdin must end.

    git diff | quick-transfer

## Options

### -a, --address <IPv4-address>

Type: `string`
<br>Default: `0.0.0.0`

Bind the node server to listen on this IPv4 address.

### -d, --display <IPv4-address>

Type: `string`

Provide an alternate IPv4 address to display without binding to the server. Useful when the server is behind multiple local routers, like inside VirtualBox.

### -e, --extension <name>

Type: `string`

Override the extension, usually when piping data. For example `create-pdf README.md | quick-transfer -e pdf`.

### -f, --filename <name>

Type: `string`

Override the entire filename. You may specify the basename here and the extension with either `-e` or `-t`.

### -g, --glob

Type: `boolean`
<br>Default: `false`

Force filename arguments to be glob expanded (instead of using the shell). For example `quick-transfer -g -- '*.js'`.

### -h, --help

Type: `boolean`

Displays the usage string.

### -p, --port <number>

Type: `number`

Use the specified port instead of a system assigned port.

### -t, --type <content-type>

Type: `string`

Provide the content type header. When specified this will change the filename's extension accordingly. Overrides any value passed in with `-e`.

### -v, --verbose

Type: `boolean`

Force additional logging. Turn this on before reporting a bug.

### --version

Type: `boolean`

Displays the version information.

Related
-------

 * [qr-filetransfer](https://github.com/claudiodangelis/qr-filetransfer) - Inspired this project, written in golang.

License
-------

ISC - Copyright &copy; 2018, Cody A. Taylor
