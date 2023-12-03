#!/bin/bash

#===========
# Parameters
#===========

PASSWORD="$1"

#======
# Login
#======

LOGIN=$(echo "$PASSWORD" | sudo -S echo "User logged in")
if [[ $LOGIN == *"User logged in"* ]]; then
    echo "User logged in"
    exit 0
else
    echo "User not logged in"
    exit 1
fi
