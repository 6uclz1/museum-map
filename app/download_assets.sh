# Read URLs from asset.json and download each file
jq -r '.[]' ./asset.json | while read -r url; do
  filename=$(basename "$url")
  curl -s "$url" -o "$filename"
  # Convert .webp to .png while preserving transparency
  magick convert "$filename" "${filename%.webp}.png"
done

# Zip all .png files into a single archive
zip -r assets.zip *.png
