# Our World Of Text README #

# OWOT Dev setup instructions


Lets iterate over how to start developing with us!

You'll need NodeJs : https://nodejs.org/ ->

 - Your platform should be autodetected, but incase it isn't right:
 
   - https://nodejs.org/en/download/ gives more specific options:
   
     I'll be downloading the LTS 'Windows Installer (.msi)' for 64-bit
     
 - LTS is the stable version of node, which is for folks like us!

You'll need Git : https://git-scm.com/ ->

 - I'll be getting the GUI from their downloads link https://git-scm.com/downloads
 - Download based on your platform ( In my case 'Windows' )
 - A download popup should appear, otherwise use the link "If your download hasn't started, click here to download manually."
 - Run it
 - Installing windows version gives me these options:
    'Windows Explorer integration: Bash, GUI'
    both of which I HIGHLY recommend, because they're both awesome!
 - Git LFS (large file support) is always a plus, and file associations are great also!
 - I also set NotePad++ to my default commit message thingamabob, which I love anyways.
 - etc, etc, etc
    
Next, we'll clone the repository to some workspace
I keep all of my projects in my /Desktop folder, ex:
    
    C:\Users\Jonathan\Desktop\Projects\Node
    
So i'll open up a terminal and navigate to that directory:
    
    cd C:\Users\Jonathan\Desktop\Projects\Node
    
Now i'll use git from the command line (its added to your environment 'path' variable, so its a global command)
    
    'git clone https://bitbucket.org/SystemTwentyone/nodeworldoftext.git'
    
You'll need to login to bitbucket, because at the time of this writting, the repository is private:

A popup window should appear, so enter the email you used to register your bitbucket
account, and the password you setup also.

- If that window never appeared, or you don't want to use the GUI for some reason (hit exit button), you should see the following in your terminal:
    
    Login failed, use ctrl+c to cancel basic credential prompt.
    Username for 'https://bitbucket.org':
    
After that, enter your password
    
    Password for 'https://< your username|email >@bitbucket.org':
    
And if you've entered correct credentials, and have the permissions necessary,
you should see the repository cloning via git.
It will complete somewhat quickly, and say ' done.' when its done.

Now we'll need to install dependencies!
In terminal, navigate to the repository we cloned:
    
    cd C:\Users\Jonathan\Desktop\Projects\Node\nodeworldoftext
    
Now we use Node JS's package manager (came with our fresh install of Node JS)
to install the dependencies using this command:
    
    npm install
    
npm is also a global command, so it can be executed anywhere in theory.
The above command tells npm to install dependencies given by the repository's
    
    package.json
    
After the package installation process is done, we're ready to go!
Lets test out the server for fun!

Navigate to the repository
    
    cd C:\Users\Jonathan\Desktop\Projects\Node\nodeworldoftext
    
Now use 'node' command to start the server using the main script:
    
    node runserver.js
    
You should now see
    Compiling HTML templates...
    Handling previous error logs (if any)
    Loading modules...
    Starting server...
    Running server in HTTP mode
    Initializing server...
    You just installed the server,
    which means you don't have any superusers defined.
    Would you like to create one now? (yes/no):
    
Type 'yes' and type your desired username -> your password -> confirm password

    Superuser created successfully.
    
    Server is running.
    Address: ::
    Port: 11001
    >>
    
Open up your browser and type in
	
	'localhost:11001'
    
Substituting the port number for whatever your terminal said the port was.

You should see a neato owot client appear just as if you were on ourworldoftext.com!

If you have any issues, you can try our discord!