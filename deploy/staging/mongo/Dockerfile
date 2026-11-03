FROM mongo:7
COPY bootstrap.sh /usr/local/bin/staging-mongo
COPY initialize.js /usr/local/bin/initialize-staging.js
RUN sed -i 's/\r$//' /usr/local/bin/staging-mongo && chmod +x /usr/local/bin/staging-mongo
ENTRYPOINT ["/usr/local/bin/staging-mongo"]
