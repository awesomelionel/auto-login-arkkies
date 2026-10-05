# Dry run against the live site: walks the whole booking flow and stops at the
# CONFIRM button without clicking it. Nothing is booked, no door is unlocked.
#   ruby check.rb [home_gym] [destination_gym]
#   ruby check.rb --gyms      # print the live Ark Grit list, to refresh GYMS
require_relative 'arkkies'

driver = build_driver
begin
  login(driver)
  if ARGV.first == '--gyms'
    puts gym_list(driver).map(&:inspect).join(", ")
  else
    home = ARGV[0] || DEFAULT_HOME
    dest = ARGV[1] || DEFAULT_DESTINATION
    select_home_gym(driver, home)
    click_text driver, '//button', /\ABookings\z/
    click_text driver, "//*[@role='button']", /Season Pass/
    click_text driver, '//button', /\AArk Grit #{Regexp.escape(dest)}\z/
    click_text driver, '//button', /\A\d{1,2} \w+ \d{4},/
    click_text driver, '//button', /Gym Time/
    raise "flow did not reach CONFIRM" unless wait_for(driver, '//button', /\ACONFIRM\z/)
    puts "OK - home #{home} -> booking at Ark Grit #{dest}, stopped at CONFIRM (nothing booked)"
  end
rescue => e
  driver.save_screenshot("/tmp/arkkies_check_failure.png") rescue nil
  abort "FAIL - #{e.class}: #{e.message} (screenshot: /tmp/arkkies_check_failure.png)"
ensure
  driver.quit
end
