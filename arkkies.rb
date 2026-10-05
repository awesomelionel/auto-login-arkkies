require "selenium-webdriver"
require "dotenv/load"

# ponytail: hardcoded because the dropdowns must render before we have a browser
# session. Goes stale when Arkkies adds outlets - `ruby check.rb --gyms` prints
# the current live list to paste back in. Selectors match by text, so a stale
# list only costs a missing option, never a broken run.
GYMS = [
  "Bishan", "Bishan North", "Buangkok", "Choa Chu Kang", "Downtown East",
  "Farrer Park", "Fuchun", "Geylang", "Hougang 422", "Hougang 423",
  "Jurong Spring CC", "Jurong West 722", "Jurong West 724", "Keat Hong",
  "Marymount", "Serangoon North 533", "Serangoon North 534", "Telok Ayer",
  "Woodlands"
].freeze

DEFAULT_HOME = ENV.fetch('HOME_GYM', 'Bishan')
DEFAULT_DESTINATION = ENV.fetch('DESTINATION_GYM', 'Bishan North')
DOOR = ENV.fetch('DOOR', 'Main Door')

# ponytail: match on visible text, never on element position. Arkkies keeps adding
# outlets, which shifts every positional XPath and silently breaks the script.
def wait_for(driver, xpath, pattern = nil, timeout: 20)
  Selenium::WebDriver::Wait.new(timeout: timeout, message: "no visible #{xpath} matching #{pattern.inspect}").until do
    driver.find_elements(xpath: xpath).find do |el|
      (el.displayed? rescue false) && (pattern.nil? || el.text.to_s.strip.match?(pattern))
    end
  end
end

# ponytail: JS click - MUI ripple spans swallow native clicks in headless Chrome
def click(driver, el)
  driver.execute_script("arguments[0].scrollIntoView({block:'center'}); arguments[0].click();", el)
end

def click_text(driver, xpath, pattern, timeout: 20)
  click(driver, wait_for(driver, xpath, pattern, timeout: timeout))
end

def build_driver(headless: true)
  options = Selenium::WebDriver::Chrome::Options.new
  options.page_load_strategy = :normal
  options.add_argument("--headless=new") if headless
  options.add_argument("--disable-gpu")
  options.add_argument("window-size=1024,900")
  options.add_argument("--no-sandbox")
  # ponytail: Cloud Run gives the container a tiny /dev/shm; without this Chrome
  # dies mid-run with "session deleted because of page crash".
  options.add_argument("--disable-dev-shm-usage")
  Selenium::WebDriver.for :chrome, options: options
end

def login(driver)
  driver.navigate.to 'https://arkkies.com'
  wait_for(driver, '//*[@id="email"]').send_keys(ENV.fetch('EMAIL'))
  driver.find_element(id: 'password').send_keys(ENV.fetch('PASSWORD'))
  click(driver, driver.find_element(tag_name: 'button'))
  Selenium::WebDriver::Wait.new(timeout: 20).until { driver.current_url.include?('/portal') }
end

def open_side_menu(driver)
  click_text driver, '//header//button', /\A\z/   # hamburger: the only header button with no label
end

# Scoped to the Ark Grit section - "Bishan" and "Downtown East" also exist under
# Ark Pod and Ark Liv, and an unscoped match picks the wrong one.
def select_home_gym(driver, home)
  open_side_menu(driver)
  click_text driver, "//div[span[normalize-space()='Ark Grit']]//*[@role='button']", /\A#{Regexp.escape(home)}\z/
  driver.action.send_keys(:escape).perform   # dismiss the drawer if it stayed open
  # ponytail: match rendered text - MUI uppercases labels in CSS, so an XPath
  # string literal sees "Agree" where the screen says "AGREE".
  landed = wait_for driver, '//button', /\A(Bookings|AGREE)\z/
  # ponytail: never auto-accept a liability waiver on someone's behalf. Gyms you
  # have not visited gate the portal behind one until you agree in the app.
  if landed.text.to_s.strip == 'AGREE'
    raise "Ark Grit #{home} needs its liability waiver accepted once - do it in the Arkkies app, then re-run."
  end
end

def gym_list(driver)
  open_side_menu(driver)
  wait_for driver, "//div[span[normalize-space()='Ark Grit']]", nil
  driver.find_elements(xpath: "//div[span[normalize-space()='Ark Grit']]//*[@role='button']")
        .map { |e| e.text.to_s.strip }.reject(&:empty?).sort
end

# dry_run stops right before the booking is committed - used by check.rb
def book_and_unlock(driver, home: DEFAULT_HOME, destination: DEFAULT_DESTINATION, dry_run: false)
  login(driver)
  select_home_gym(driver, home)

  ## Book the earliest available slot at the destination gym
  click_text driver, '//button', /\ABookings\z/
  click_text driver, "//*[@role='button']", /Season Pass/
  click_text driver, '//button', /\AArk Grit #{Regexp.escape(destination)}\z/
  click_text driver, '//button', /\A\d{1,2} \w+ \d{4},/   # first available date
  click_text driver, '//button', /Gym Time/               # first available time slot
  return :dry_run_ok if dry_run && wait_for(driver, '//button', /\ACONFIRM\z/)

  click_text driver, '//button', /\ACONFIRM\z/
  click_text driver, '//button', /\A(CONFIRM|YES|PROCEED|OK)\z/  # confirmation dialog

  ## Unlock the door
  click_text driver, "//button | //*[@role='button']", /Gym Time/
  click_text driver, '//button', /REMOTE ENTRY/i
  click(driver, wait_for(driver, "//*[@role='combobox'] | //div[contains(@class,'MuiSelect')]"))
  click_text driver, "//li[@role='option'] | //ul/li", /#{Regexp.escape(DOOR)}/i
  click_text driver, '//button', /UNLOCK/i
  :booked_and_unlocked
end
