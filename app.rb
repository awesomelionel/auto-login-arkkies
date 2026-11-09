require "sinatra"
require "selenium-webdriver"
require "json"
require "dotenv/load"

set :bind, "0.0.0.0"
port = ENV["PORT"] || "8080"
set :port, port
set :static, true
set :public_folder, "static"
set :views, "views"
enable :sessions

get '/' do
    erb :index
end

post '/checkCredentials' do
  data = JSON.parse(request.body.read)

  username = data['username']
  password = data['password']
  gym = data['gym']
  action = data['action']

  # Check which action is used
  if action = "book_and_open"
    #call book and open method"
    screenshot = book_and_open(username,password,gym)
  elsif action = "open"
    #call open only method"
    screenshot = open_only(username,password,gym)
  else
    screenshot = "EMPTY"
  end

  # Example: Simple response based on the action
  response = {
    status: 'success',
    message: "Action #{action} for #{gym} was successful for user #{username}.",
    rtn_screenshot: screenshot
  }

  # Send response back to the client
  response.to_json
end

def book_and_open(username,password,gym)
  options = Selenium::WebDriver::Chrome::Options.new
  options.page_load_strategy = :normal
  # to run Chrome in headless mode
  options.add_argument("--headless") # comment out in development
  options.add_argument('--disable-gpu')
  options.add_argument('--no-sandbox')
  # create a driver instance to control Chrome
  # with the specified options
  driver = Selenium::WebDriver.for :chrome, options: options
  driver.navigate.to 'https://arkkies.com' # Replace with your desired URL

  driver.manage.timeouts.implicit_wait = 30
  wait = Selenium::WebDriver::Wait.new(timeout: 45, interval: 5, message: 'Timed out after 45 seconds')
  revealed = driver.find_element(id: 'email')
  wait.until { revealed.displayed? }

  ### Select the elements
  email_input = driver.find_element(id: 'email')
  password_input = driver.find_element(id: 'password')

  email_input.clear
  email_input.send_keys(username)
  password_input.clear
  password_input.send_key(password)

  login_bttn = driver.find_element(tag_name: 'button')
  driver.action.click(login_bttn).perform

  revealed = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[1]/header/div/button')
  wait.until { revealed.displayed? }

  ## Set selected Gym parameters
  case gym
  when "Bishan"
    gym_url =  'https://arkkies.com/portal/outlet?outlet-id=AGRBIS01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[1]/button'
  when "Hougang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRHUG01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[2]/button'
  when "Choa Chu Kang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRCCK01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[3]/button'
  when "Jurong"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRJUR01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[4]/button'
  when "Geylang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRGYL01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[5]/button'
  when "Keat Hong"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRKHG01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[6]/button'
  when "Serangoon North"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRSRN01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[7]/button'
  end

  driver.navigate.to gym_url

  ##Click the bookings button to make a new booking
  bookings_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[2]/button[2]')
  driver.action.click(bookings_bttn).perform

  #sleep(1)
  revealed = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[2]/ul/li[2]/ul/div/li/div[2]')
  wait.until { revealed.displayed? }
  ##Select Season pass button

  seasonpass_link = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[2]/ul/li[2]/ul/div/li/div[2]')
  driver.action.click(seasonpass_link).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div/div/div[1]/button')
  wait.until { revealed.displayed? }

  ##Click Gym again! 
  destination_bttn = driver.find_element(xpath:gym_xpath)
  driver.action.click(destination_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[2]/div/div[1]/button')
  wait.until { revealed.displayed? }

  ### Select earliest available date and time
  first_date_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[2]/div/div[1]/button')
  driver.action.click(first_date_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[3]/div/div/button')
  wait.until { revealed.displayed? }

  ### Select first timeslot
  first_time_slot_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[3]/div/div/button')
  driver.action.click(first_time_slot_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[1]/div/button[2]')
  wait.until { revealed.displayed? }

  ### Confirm booking
  confirm_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[1]/div/button[2]')
  driver.action.click(confirm_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath:'/html/body/div[1]/div/div/div/div[4]/div/div/div/div[3]/button[1]')
  wait.until { revealed.displayed? }

  ### Click the damn Confirm button again
  confirm_bttn_two = driver.find_element(xpath:'/html/body/div[1]/div/div/div/div[4]/div/div/div/div[3]/button[1]')
  driver.action.click(confirm_bttn_two).perform

  driver.navigate.to gym_url

  #sleep(1)
  revealed = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div')
  wait.until { revealed.displayed? }

  ### Click Gym time to open the door
  gymtime_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div')
  driver.action.click(gymtime_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div[1]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div[2]/div/div/div/button[2]')
  wait.until { revealed.displayed? }

  ### Select the remote entry button
  remote_entry_bttn = driver.find_element(xpath: '/html/body/div[1]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div[2]/div/div/div/button[2]')
  driver.action.click(remote_entry_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div/div/div/div/div/div')
  wait.until { revealed.displayed? }

  ###Select Drop down
  select_drop_down = driver.find_element(xpath: '/html/body/div/div/div/div/div/div')
  driver.action.click(select_drop_down).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div[2]/div[3]/ul/li[2]')
  wait.until { revealed.displayed? }

  sleep(0.5)
  ###Select main door
  main_door = driver.find_element(xpath: '/html/body/div[2]/div[3]/ul/li[2]')
  driver.action.click(main_door).perform

  revealed = driver.find_element(xpath:'/html/body/div/div/div/div/button')
  wait.until { revealed.displayed? }

  ###Click unlock
  unlock_bttn = driver.find_element(xpath:'/html/body/div/div/div/div/button')
  driver.action.click(unlock_bttn).perform

  screenshot_path = '/tmp/screenshot.png'
  driver.save_screenshot(screenshot_path)

  ## Encode the screenshot to Base64
  screenshot_base64 = Base64.encode64(File.read(screenshot_path))
  return screenshot_base64
end

def open_only(username,password,gym)
  options = Selenium::WebDriver::Chrome::Options.new
  options.page_load_strategy = :normal
  # to run Chrome in headless mode
  #options.add_argument("--headless") # comment out in development
  options.add_argument('--disable-gpu')
  options.add_argument('--no-sandbox')
  # create a driver instance to control Chrome
  # with the specified options
  driver = Selenium::WebDriver.for :chrome, options: options
  driver.navigate.to 'https://arkkies.com' # Replace with your desired URL

  driver.manage.timeouts.implicit_wait = 30
  wait = Selenium::WebDriver::Wait.new(timeout: 45, interval: 5, message: 'Timed out after 45 seconds')
  revealed = driver.find_element(id: 'email')
  wait.until { revealed.displayed? }

  ### Select the elements
  email_input = driver.find_element(id: 'email')
  password_input = driver.find_element(id: 'password')

  email_input.clear
  email_input.send_keys(username)
  password_input.clear
  password_input.send_key(password)

  login_bttn = driver.find_element(tag_name: 'button')
  driver.action.click(login_bttn).perform

  revealed = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[1]/header/div/button')
  wait.until { revealed.displayed? }

  ## Set selected Gym parameters
  case gym
  when "Bishan"
    gym_url =  'https://arkkies.com/portal/outlet?outlet-id=AGRBIS01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[1]/button'
  when "Hougang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRHUG01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[2]/button'
  when "Choa Chu Kang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRCCK01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[3]/button'
  when "Jurong"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRJUR01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[4]/button'
  when "Geylang"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRGYL01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[5]/button'
  when "Keat Hong"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRKHG01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[6]/button'
  when "Serangoon North"
    gym_url = 'https://arkkies.com/portal/outlet?outlet-id=AGRSRN01'
    gym_xpath = '//*[@id="root"]/div/div/div/div[3]/div[2]/div[1]/div/div[7]/button'
  end

  driver.navigate.to gym_url

  #sleep(1)
  revealed = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div')
  wait.until { revealed.displayed? }

  ### Click Gym time to open the door
  gymtime_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div')
  driver.action.click(gymtime_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div[1]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div[2]/div/div/div/button[2]')
  wait.until { revealed.displayed? }

  ### Select the remote entry button
  remote_entry_bttn = driver.find_element(xpath: '/html/body/div[1]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div[2]/div/div/div/button[2]')
  driver.action.click(remote_entry_bttn).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div/div/div/div/div/div')
  wait.until { revealed.displayed? }

  ###Select Drop down
  select_drop_down = driver.find_element(xpath: '/html/body/div/div/div/div/div/div')
  driver.action.click(select_drop_down).perform

  #sleep(0.8)
  revealed = driver.find_element(xpath: '/html/body/div[2]/div[3]/ul/li[2]')
  wait.until { revealed.displayed? }

  sleep(0.5)
  ###Select main door
  main_door = driver.find_element(xpath: '/html/body/div[2]/div[3]/ul/li[2]')
  driver.action.click(main_door).perform

  revealed = driver.find_element(xpath:'/html/body/div/div/div/div/button')
  wait.until { revealed.displayed? }

  ###Click unlock
  unlock_bttn = driver.find_element(xpath:'/html/body/div/div/div/div/button')
  driver.action.click(unlock_bttn).perform

  screenshot_path = '/tmp/screenshot.png'
  driver.save_screenshot(screenshot_path)

  ## Encode the screenshot to Base64
  screenshot_base64 = Base64.encode64(File.read(screenshot_path))
  return screenshot_base64
end

# Gracefully quit the driver when the application exits
at_exit do
end
