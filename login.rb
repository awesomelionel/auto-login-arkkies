require "selenium-webdriver"
require "dotenv/load"
require "debug"


EMAIL = ENV['EMAIL']
PASSWORD = ENV['PASSWORD']

options = Selenium::WebDriver::Chrome::Options.new
options.page_load_strategy = :normal
# to run Chrome in headless mode
options.add_argument("--headless") # comment out in development
options.add_argument("--disable-gpu")
options.add_argument("window-size=1024,768")
options.add_argument("--no-sandbox")
# create a driver instance to control Chrome
# with the specified options

driver = Selenium::WebDriver.for :chrome, options: options

page = 'https://arkkies.com'

driver.navigate.to page
sleep(0.5)
#driver.manage.timeouts.implicit_wait = 30
#wait = Selenium::WebDriver::Wait.new(timeout: 45, interval: 5, message: 'Timed out after 45 seconds')
#revealed = driver.find_element(id: 'email')
#wait.until { revealed.displayed? }

### Select the elements
email_input = driver.find_element(id: 'email')
password_input = driver.find_element(id: 'password')

email_input.clear
email_input.send_keys(EMAIL)
password_input.clear
password_input.send_key(PASSWORD)

login_bttn = driver.find_element(tag_name: 'button')
driver.action.click(login_bttn).perform

sleep(2)

menu_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[1]/header/div/button')
driver.action.click(menu_bttn).perform

sleep(0.5)

bishan_arkgrit_link = driver.find_element(xpath: '/html/body/div[2]/div[3]/div[2]/div[7]/ul[1]/div')
driver.action.click(bishan_arkgrit_link).perform

sleep(0.5)

backdrop = driver.find_element(xpath: '/html/body/div[2]/div[1]')
driver.action.click(backdrop).perform

sleep(0.5)

bookings_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[2]/button[2]')
driver.action.click(bookings_bttn).perform

sleep(0.5)

seasonpass_link = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[2]/ul/li[2]/ul/div/li/div[2]')
driver.action.click(seasonpass_link).perform

sleep(0.5)

bishan_destination_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div/div/div[1]/button')
driver.action.click(bishan_destination_bttn).perform

sleep(0.5)
## Select earliest available date and time
first_date_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[2]/div/div[1]/button')
driver.action.click(first_date_bttn).perform

sleep(0.5)

first_time_slot_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[2]/div[3]/div/div/button')
driver.action.click(first_time_slot_bttn).perform

sleep(0.5)

confirm_bttn = driver.find_element(xpath:'//*[@id="root"]/div/div/div/div[3]/div[1]/div/button[2]')
driver.action.click(confirm_bttn).perform

##binding.b

sleep(0.5)
## Click the damn Confirm button again
confirm_bttn_two = driver.find_element(xpath:'/html/body/div[1]/div/div/div/div[4]/div/div/div/div[3]/button[1]')
driver.action.click(confirm_bttn_two).perform

driver.navigate.to 'https://arkkies.com/portal/outlet?outlet-id=AGRBIS01'

sleep(1)

gymtime_bttn = driver.find_element(xpath: '//*[@id="root"]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div')
driver.action.click(gymtime_bttn).perform

sleep(0.5)

remote_entry_bttn = driver.find_element(xpath: '/html/body/div[1]/div/div/div/div[3]/div[3]/div[1]/div[2]/ul/li[2]/ul/div[2]/div/div/div/button[2]')
driver.action.click(remote_entry_bttn).perform

sleep(0.3)

##Select Drop down
select_drop_down = driver.find_element(xpath: '/html/body/div/div/div/div/div/div')
driver.action.click(select_drop_down).perform

sleep(0.3)

##Select main door
main_door = driver.find_element(xpath: '/html/body/div[2]/div[3]/ul/li[2]')
driver.action.click(main_door).perform

sleep(0.3)

##Click unlock
unlock_bttn = driver.find_element(xpath:'/html/body/div/div/div/div/button')
driver.action.click(unlock_bttn).perform

## Continue to log in and open the door
#driver.save_screenshot("./screen.png")

# close the browser and release its resources
driver.quit