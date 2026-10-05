require 'sinatra'
require_relative 'arkkies'

set :bind, "0.0.0.0"
set :port, ENV["PORT"] || "8080"
set :static, true
set :public_folder, "static"
set :views, "views"
enable :sessions

get '/' do
  erb :index
end

post '/run_script' do
  home = params[:home] || DEFAULT_HOME
  destination = params[:destination] || DEFAULT_DESTINATION
  halt 400, "Unknown gym" unless GYMS.include?(home) && GYMS.include?(destination)

  driver = build_driver
  begin
    book_and_unlock(driver, home: home, destination: destination)
    "Booked and unlocked Ark Grit #{destination}."
  rescue StandardError => e
    driver.save_screenshot("/tmp/arkkies_failure.png") rescue nil
    status 500
    "Failed: #{e.message}"
  ensure
    driver.quit
  end
end
