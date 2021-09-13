[jrojer.github.io](https://jrojer.github.io)

The app allows computers (clients/browsers) perform distributed computing. 
There is a master computer and workers. 
The master can send data and commands to workers to work on.

1. For each client open the page.
2. For 1 client choose master mode. For others - worker mode.
3. Connect workers. Using master, type in the worker's id (can be found on the worker's page) in the textarea and press "create offer".  
   Make sure the worker added the channel (see the worker's log).
4. Now when the workers are connected you can send them messages from the textarea by typing the text and clicking "Send message".
5. Workers accept wasm files with a funciton "int sum(int, int)" defined.  
   To send the file, choose the file and click "Send file".
6. Workers execute "sum(x,y)" function on command message "Run x y" where x and y are integers.
