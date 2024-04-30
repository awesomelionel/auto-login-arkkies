require 'sinatra'

set :port, 8080
set :static, true
set :public_folder, "static"
set :views, "views"
enable :sessions

get '/' do
    erb :index
end

post '/run_script' do
    # Execute your script here
    # You can use system calls, spawn, or other methods to run your script
    # Example: `system('ruby my_script.rb &')` to run it in the background
    # Make sure to handle any necessary security precautions (e.g., sanitizing input).
    # Respond with an appropriate message or status.
    system('ruby login.rb &')

    p 'Script is running in the background!'
end
