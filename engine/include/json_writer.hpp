// json_writer.hpp — minimal streaming JSON writer (no external libraries).
// Infinity and NaN are written as null, because JSON has no representation for them.
#pragma once

#include <cmath>
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

namespace route {

class JsonWriter {
public:
    JsonWriter& beginObject() { prefix(); out_ << '{'; first_.push_back(true); return *this; }
    JsonWriter& endObject() { out_ << '}'; first_.pop_back(); return *this; }
    JsonWriter& beginArray() { prefix(); out_ << '['; first_.push_back(true); return *this; }
    JsonWriter& endArray() { out_ << ']'; first_.pop_back(); return *this; }

    JsonWriter& key(const std::string& k) {
        prefix();
        writeString(k);
        out_ << ':';
        afterKey_ = true;
        return *this;
    }

    JsonWriter& value(const std::string& s) { prefix(); writeString(s); return *this; }
    JsonWriter& value(const char* s) { return value(std::string(s)); }
    JsonWriter& value(bool b) { prefix(); out_ << (b ? "true" : "false"); return *this; }
    JsonWriter& value(int i) { prefix(); out_ << i; return *this; }
    JsonWriter& value(double d) {
        prefix();
        if (!std::isfinite(d)) { out_ << "null"; return *this; }
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.6f", d);  // fixed precision, then trim zeros
        std::string s(buf);
        size_t dot = s.find('.');
        if (dot != std::string::npos) {
            while (!s.empty() && s.back() == '0') s.pop_back();
            if (!s.empty() && s.back() == '.') s.pop_back();
        }
        if (s == "-0") s = "0";
        out_ << s;
        return *this;
    }
    JsonWriter& null() { prefix(); out_ << "null"; return *this; }

    template <typename T>
    JsonWriter& field(const std::string& k, const T& v) { key(k); return value(v); }

    std::string str() const { return out_.str(); }

private:
    // Writes the comma between siblings, except straight after a key.
    void prefix() {
        if (afterKey_) { afterKey_ = false; return; }
        if (!first_.empty()) {
            if (!first_.back()) out_ << ',';
            first_.back() = false;
        }
    }

    void writeString(const std::string& s) {
        out_ << '"';
        for (char c : s) {
            switch (c) {
                case '"': out_ << "\\\""; break;
                case '\\': out_ << "\\\\"; break;
                case '\n': out_ << "\\n"; break;
                case '\r': out_ << "\\r"; break;
                case '\t': out_ << "\\t"; break;
                default:
                    if (static_cast<unsigned char>(c) < 0x20) {
                        char buf[8];
                        std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                        out_ << buf;
                    } else {
                        out_ << c;
                    }
            }
        }
        out_ << '"';
    }

    std::ostringstream out_;
    std::vector<bool> first_;
    bool afterKey_ = false;
};

}  // namespace route
