FROM selenium/standalone-chrome

# Install Ruby.
RUN \
  sudo apt-get update && \
  sudo apt-get install -y ruby ruby-dev ruby-bundler && \
  sudo rm -rf /var/lib/apt/lists/*


# Set environment variables
ENV DISPLAY=:99
EXPOSE 8080

# Create a directory for the application
WORKDIR /app

# Copy Gemfile and Gemfile.lock to the container
COPY Gemfile Gemfile.lock ./

# Install Ruby dependencies
RUN sudo bundle install

# Copy the application code
COPY . .

# Command to run the application
CMD ["ruby", "app.rb"]